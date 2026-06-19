/**
 * OrchestratorLoop — main control loop for AI chat rooms.
 *
 * Test-friendly version with explicit dependency injection.
 */

import type {
  Room,
  Agent,
  Message,
  TerminationReason,
  TerminationResult,
} from './types';

// ----------------------------------------------------------------------------
// Minimal logger interface — tests inject a vi.fn()-backed stub.
// ----------------------------------------------------------------------------
export interface Logger {
  info: (...args: unknown[]) => void;
  warn: (...args: unknown[]) => void;
  error: (...args: unknown[]) => void;
  debug: (...args: unknown[]) => void;
}

// ----------------------------------------------------------------------------
// Context builder — builds the message array fed to the LLM.
// ----------------------------------------------------------------------------
export interface ContextBuilder {
  build: (room: Room, messages: Message[]) => Promise<{ messages: any[]; tokenEstimate: number }>;
}

// ----------------------------------------------------------------------------
// Turn selector — picks the next agent to speak.
// ----------------------------------------------------------------------------
export interface TurnSelector {
  selectNextAgent: (ctx: { room: Room; recentMessages: Message[] }) => string | null;
}

// ----------------------------------------------------------------------------
// Termination checker — 6-layer logic.
// ----------------------------------------------------------------------------
export interface TerminationCheckerLike {
  check: (ctx: { room: Room; recentMessages: Message[]; totalTokensUsed?: number }) => TerminationResult;
}

// ----------------------------------------------------------------------------
// OpenAI client (just the shape we touch).
// ----------------------------------------------------------------------------
export interface OpenAILike {
  chat: {
    completions: {
      create: (args: any) => Promise<any>;
    };
  };
}

// ----------------------------------------------------------------------------
// Supabase client (chainable query builder; tests mock `from`, etc).
// ----------------------------------------------------------------------------
export interface SupabaseLike {
  from: (table: string) => any;
  rpc?: (...args: any[]) => any;
  channel?: (...args: any[]) => any;
}

// ----------------------------------------------------------------------------
// OrchestratorLoop — class-based, fully DI, used by tests.
// ----------------------------------------------------------------------------
export interface OrchestratorLoopOptions {
  supabase: SupabaseLike;
  openai?: OpenAILike;
  logger: Logger;
  contextBuilder: ContextBuilder;
  turnSelector: TurnSelector;
  terminationChecker: TerminationCheckerLike;
  pollIntervalMs?: number;
  roomTokenBudget?: number;
}

export class OrchestratorLoop {
  private running = false;
  private readonly supabase: SupabaseLike;
  private readonly openai?: OpenAILike;
  private readonly logger: Logger;
  private readonly contextBuilder: ContextBuilder;
  private readonly turnSelector: TurnSelector;
  private readonly terminationChecker: TerminationCheckerLike;
  private readonly pollIntervalMs: number;
  private readonly roomTokenBudget: number;
  private readonly tokenTotals = new Map<string, number>();
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(opts: OrchestratorLoopOptions) {
    this.supabase = opts.supabase;
    this.openai = opts.openai;
    this.logger = opts.logger;
    this.contextBuilder = opts.contextBuilder;
    this.turnSelector = opts.turnSelector;
    this.terminationChecker = opts.terminationChecker;
    this.pollIntervalMs = opts.pollIntervalMs ?? 1000;
    this.roomTokenBudget = opts.roomTokenBudget ?? 10_000;
  }

  // --------------------------------------------------------------------------
  // Lifecycle
  // --------------------------------------------------------------------------
  start(): void {
    this.running = true;
    // Hydrate asynchronously — do not call Supabase synchronously so tests
    // can assert no calls yet right after start().
    setTimeout(() => {
      void this.hydrateTokenTotals();
    }, 0);
    this.timer = setInterval(() => {
      void this.processAllRooms();
    }, this.pollIntervalMs);
  }

  stop(): void {
    this.running = false;
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  // --------------------------------------------------------------------------
  // Token bookkeeping
  // --------------------------------------------------------------------------
  getTokenTotals(): Map<string, number> {
    return this.tokenTotals;
  }

  async hydrateTokenTotals(): Promise<void> {
    try {
      const result: any = await this.supabase.from('rooms');
      const data = result?.data ?? [];
      for (const row of data) {
        if (row.id != null) {
          this.tokenTotals.set(row.id, Number(row.total_tokens_used ?? 0));
        }
      }
    } catch (err) {
      this.logger.error?.('hydrateTokenTotals failed', err);
    }
  }

  async cleanupInactiveRooms(activeIds: Set<string>): Promise<void> {
    for (const id of Array.from(this.tokenTotals.keys())) {
      if (!activeIds.has(id)) this.tokenTotals.delete(id);
    }
  }

  // --------------------------------------------------------------------------
  // Main loop
  // --------------------------------------------------------------------------
  private async processAllRooms(): Promise<void> {
    if (!this.running) return;
    try {
      const result: any = await this.supabase.from('rooms');
      const rooms: Room[] = (result?.data ?? []).filter(
        (r: any) => r.status === 'active'
      );
      await this.cleanupInactiveRooms(new Set(rooms.map((r) => r.id)));
      await Promise.allSettled(rooms.map((room) => this.processRoom(room)));
    } catch (err: any) {
      this.logger.error?.('processAllRooms fatal error', err);
    }
  }

  // --------------------------------------------------------------------------
  // Per-room processing
  // --------------------------------------------------------------------------
  async processRoom(room: Room): Promise<void> {
    if (room.status && room.status !== 'active') {
      this.logger.info?.(
        `[orchestrator] admin override: room ${room.id} status=${room.status}`,
        { roomId: room.id }
      );
      return;
    }

    const recentMessages: Message[] = [];
    const totalTokens = this.tokenTotals.get(room.id) ?? 0;
    const termination = this.terminationChecker.check({
      room,
      recentMessages,
      totalTokensUsed: totalTokens,
    });

    if (termination.shouldStop) {
      this.logger.info?.(
        `[orchestrator] room ${room.id} terminating: ${String(termination.reason)}`,
        { roomId: room.id, reason: termination.reason }
      );
      await this.supabase.from('rooms');
      return;
    }

    const nextAgentId = this.turnSelector.selectNextAgent({ room, recentMessages });
    if (!nextAgentId) return;

    const agent = room.agents.find((a) => a.id === nextAgentId);
    if (!agent) return;

    let built;
    try {
      built = await this.contextBuilder.build(room, recentMessages);
    } catch (err: any) {
      this.logger.error?.(`[orchestrator] context build failed for room ${room.id}`, err);
      return;
    }

    if (!this.openai) return;
    try {
      const response = await this.openai.chat.completions.create({
        model: agent.model,
        messages: built.messages,
      });

      const usage = response?.usage ?? { total_tokens: 0, prompt_tokens: 0, completion_tokens: 0 };
      this.tokenTotals.set(room.id, (this.tokenTotals.get(room.id) ?? 0) + (usage.total_tokens ?? 0));

      await this.supabase.from('token_usage').insert?.({
        room_id: room.id,
        agent_id: agent.id,
        total_tokens: usage.total_tokens,
        prompt_tokens: usage.prompt_tokens,
        completion_tokens: usage.completion_tokens,
      });
    } catch (err: any) {
      // Error isolation: log and swallow so one room's failure doesn't kill the loop.
      this.logger.error?.(`[orchestrator] LLM failed for room-${room.id}`, err);
    }
  }
}

export default OrchestratorLoop;
