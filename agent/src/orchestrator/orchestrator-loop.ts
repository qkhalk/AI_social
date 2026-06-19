import {
  POLL_INTERVAL_MS,
  MIN_THINKING_DELAY_MS,
  MAX_THINKING_DELAY_MS,
} from '../config';
import { RoomWithAgents, Message } from '../types';
import { fetchActiveRoomsWithAgents, fetchRecentMessages, insertAgentMessage, insertSystemMessage, updateRoomStatus, getRoomMessageCount } from '../services/message-service';
import { callLLM } from '../services/llm-client';
import { logOrchestratorAction, trackTokenUsage, estimateCost } from '../services/logging-service';
import { checkTermination } from "./termination-checker-class";
import { selectNextAgent } from "./turn-selector-fns";
import { buildContext } from './context-builder';
import { extractMemoriesFromConversation } from '../services/memory-service';
import { isSummaryNeeded, generateSummary } from '../services/summary-service';

// Track cumulative token usage per room to enforce budget.
// Hydrated from DB on startup so restarts don't bypass the budget.
const roomTokenTotals = new Map<string, number>();

/**
 * Load cumulative token totals from DB for all active rooms.
 * Called once at startup to persist budget across restarts.
 */
async function hydrateTokenTotals(): Promise<void> {
  const { getSupabaseClient } = await import('../services/supabase-client');
  const supabase = getSupabaseClient();
  const { data } = await supabase
    .from('token_usage')
    .select('room_id, total_tokens')
    .not('room_id', 'is', null);

  if (data) {
    const totals = new Map<string, number>();
    for (const row of data) {
      const current = totals.get(row.room_id) ?? 0;
      totals.set(row.room_id, current + row.total_tokens);
    }
    for (const [roomId, total] of totals) {
      roomTokenTotals.set(roomId, total);
    }
    console.log(`[orchestrator] Hydrated token totals for ${totals.size} room(s)`);
  }
}

/**
 * Clean up token totals for rooms no longer active.
 * Prevents slow memory leak when rooms are paused/archived externally.
 */
async function cleanupInactiveRooms(activeRooms: RoomWithAgents[]): Promise<void> {
  const activeIds = new Set(activeRooms.map(r => r.id));
  for (const roomId of roomTokenTotals.keys()) {
    if (!activeIds.has(roomId)) {
      roomTokenTotals.delete(roomId);
    }
  }
}

export class OrchestratorLoop {
  private running = false;

  async start(): Promise<void> {
    this.running = true;
    await hydrateTokenTotals();
    console.log('[orchestrator] Loop started. Polling every', POLL_INTERVAL_MS, 'ms');

    while (this.running) {
      try {
        await this.processAllRooms();
      } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : String(error);
        console.error('[orchestrator] Fatal error in processAllRooms:', msg);
      }

      await this.sleep(POLL_INTERVAL_MS);
    }

    console.log('[orchestrator] Loop stopped.');
  }

  stop(): void {
    console.log('[orchestrator] Stop requested. Finishing current turn...');
    this.running = false;
  }

  private async processAllRooms(): Promise<void> {
    const rooms = await fetchActiveRoomsWithAgents();

    if (rooms.length === 0) return;

    // Free token totals for rooms no longer active (paused/archived externally)
    await cleanupInactiveRooms(rooms);

    console.log(`[orchestrator] Processing ${rooms.length} active room(s)`);

    for (const room of rooms) {
      // Each room is independent — one failure must not block others
      try {
        await this.processRoom(room);
      } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : String(error);
        console.error(`[orchestrator] Error in room ${room.id}:`, msg);
        await logOrchestratorAction(room.id, null, 'room_error', { error: msg });
      }
    }
  }

  private async processRoom(room: RoomWithAgents): Promise<void> {
    if (room.agents.length === 0) return;

    // Fetch current message count and recent history
    const messageCount = await getRoomMessageCount(room.id);
    const tokensUsed = roomTokenTotals.get(room.id) ?? 0;
    const recentMessages = await fetchRecentMessages(room.id, 20);

    // Check all termination layers — now includes convergence and natural-end heuristics
    const termination = checkTermination(room, messageCount, tokensUsed, recentMessages);
    if (termination.shouldStop) {
      await this.concludeRoom(room, termination.reason, recentMessages);
      return;
    }

    // Generate periodic summary to compress conversation history
    await this.maybeGenerateSummary(room.id, messageCount, recentMessages);

    // Select next agent and build context (now includes memories + summary)
    const agent = selectNextAgent(room, recentMessages);
    if (!agent) return;

    await logOrchestratorAction(room.id, agent.id, 'turn_start');

    const context = await buildContext(room, agent, recentMessages);

    // Call LLM with agent's configured model and temperature
    const model = agent.model_name || 'meta-llama/llama-4-scout:free';
    const temperature = agent.response_temperature ?? 0.8;
    const response = await callLLM({
      credentialId: agent.model_credential_id,
      messages: context,
      temperature,
      maxTokens: 500,
    });

    // Insert response as a new message
    await insertAgentMessage(room.id, agent.id, response.content);

    // Track token usage and update running totals
    const cost = estimateCost(model, response.usage.prompt_tokens, response.usage.completion_tokens);
    await trackTokenUsage({
      agent_id: agent.id,
      room_id: room.id,
      model_name: model,
      prompt_tokens: response.usage.prompt_tokens,
      completion_tokens: response.usage.completion_tokens,
      total_tokens: response.usage.total_tokens,
      cost_usd: cost,
    });

    roomTokenTotals.set(room.id, tokensUsed + response.usage.total_tokens);

    await logOrchestratorAction(room.id, agent.id, 'turn_end', {
      tokens: response.usage.total_tokens,
      cost_usd: cost,
    });

    // Natural delay so messages don't appear instantaneously
    await this.randomDelay();
  }

  /**
   * Check if a conversation summary is due and generate one.
   * Summaries compress history so the context window stays manageable.
   */
  private async maybeGenerateSummary(
    roomId: string,
    messageCount: number,
    messages: Message[]
  ): Promise<void> {
    try {
      if (await isSummaryNeeded(roomId, messageCount)) {
        await generateSummary(roomId, messages);
      }
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      console.error(`[orchestrator] Summary generation failed for room ${roomId}: ${msg}`);
    }
  }

  private async concludeRoom(
    room: RoomWithAgents,
    reason: string,
    recentMessages: Message[]
  ): Promise<void> {
    console.log(`[orchestrator] Concluding room ${room.id}: ${reason}`);

    // Extract memories from the full conversation for each participating agent.
    // Best-effort: failures are caught internally and logged.
    for (const agent of room.agents) {
      try {
        await extractMemoriesFromConversation(room.id, agent.id, recentMessages);
      } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : String(error);
        console.error(`[orchestrator] Memory extraction failed for agent ${agent.id}: ${msg}`);
      }
    }

    await insertSystemMessage(
      room.id,
      `Conversation ended: ${reason}. Thank you for following this discussion!`
    );
    await updateRoomStatus(room.id, 'concluded');
    await logOrchestratorAction(room.id, null, 'room_concluded', { reason });

    // Clean up token tracking for this room
    roomTokenTotals.delete(room.id);
  }

  private async randomDelay(): Promise<void> {
    const delay =
      MIN_THINKING_DELAY_MS +
      Math.random() * (MAX_THINKING_DELAY_MS - MIN_THINKING_DELAY_MS);
    return this.sleep(delay);
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
