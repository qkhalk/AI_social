/**
 * TerminationChecker — 6-layer termination logic for AI chat rooms.
 *
 * Layers (in priority order, highest first):
 *   1. admin_override  — room.status !== 'active'
 *   2. hard_cap        — messageCount >= maxMessages
 *   3. token_budget    — totalTokensUsed >= configured budget
 *   4. time_limit      — elapsed > configured max duration
 *   5. repetition      — last N messages have pairwise Jaccard > threshold
 *   6. natural_end     — last message contains configured end marker
 *
 * Built as a class (per tests). Functional wrapper kept for compatibility
 * with orchestrator-loop.ts.
 */

import type { Room as DbRoom, Message as DbMessage } from '../types';
import type {
  Room,
  Message,
  TerminationResult,
  TerminationCheckContext,
} from './types';

// ----------------------------------------------------------------------------
// Defaults
// ----------------------------------------------------------------------------
const DEFAULT_ROOM_TOKEN_BUDGET    = 10_000;
const DEFAULT_ROOM_MAX_DURATION_MS = 60 * 60 * 1000;
const DEFAULT_REPETITION_THRESHOLD = 0.7;
const DEFAULT_REPETITION_WINDOW    = 3;
const DEFAULT_END_MARKER           = '###END###';

export interface TerminationCheckerOptions {
  roomTokenBudget?: number;
  roomMaxDurationMs?: number;
  repetitionThreshold?: number;
  repetitionWindow?: number;
  endMarker?: string;
}

export class TerminationChecker {
  private readonly tokenBudget: number;
  private readonly maxDurationMs: number;
  private readonly repetitionThreshold: number;
  private readonly repetitionWindow: number;
  private readonly endMarker: string;

  constructor(opts: TerminationCheckerOptions = {}) {
    this.tokenBudget         = opts.roomTokenBudget     ?? DEFAULT_ROOM_TOKEN_BUDGET;
    this.maxDurationMs       = opts.roomMaxDurationMs   ?? DEFAULT_ROOM_MAX_DURATION_MS;
    this.repetitionThreshold = opts.repetitionThreshold ?? DEFAULT_REPETITION_THRESHOLD;
    this.repetitionWindow    = opts.repetitionWindow    ?? DEFAULT_REPETITION_WINDOW;
    this.endMarker           = opts.endMarker           ?? DEFAULT_END_MARKER;
  }

  check(ctx: TerminationCheckContext): TerminationResult {
    const { room, recentMessages, totalTokensUsed } = ctx;

    if (room.status && room.status !== 'active') {
      return { shouldStop: true, reason: 'admin_override' };
    }

    if (room.messageCount >= room.maxMessages) {
      return { shouldStop: true, reason: 'hard_cap' };
    }

    if ((totalTokensUsed ?? 0) >= this.tokenBudget) {
      return { shouldStop: true, reason: 'token_budget' };
    }

    if (room.startedAt) {
      const elapsed = Date.now() - room.startedAt;
      if (elapsed > this.maxDurationMs) {
        return { shouldStop: true, reason: 'time_limit' };
      }
    }

    if (recentMessages.length >= this.repetitionWindow) {
      const window = recentMessages.slice(0, this.repetitionWindow);
      const similarity = pairwiseMaxJaccard(window);
      if (similarity > this.repetitionThreshold) {
        return { shouldStop: true, reason: 'repetition' };
      }
    }

    if (recentMessages.length >= 1) {
      const last = recentMessages[recentMessages.length - 1];
      if (last.content && last.content.includes(this.endMarker)) {
        return { shouldStop: true, reason: 'natural_end' };
      }
    }

    return { shouldStop: false, reason: null };
  }
}

// ----------------------------------------------------------------------------
// Functional wrapper for orchestrator-loop.ts compatibility
// ----------------------------------------------------------------------------
export function checkTermination(
  room: DbRoom,
  messageCount: number,
  totalTokensUsed: number,
  recentMessages: DbMessage[] = []
): { shouldStop: boolean; reason: string } {
  const checker = new TerminationChecker();

  const localRoom: Room = {
    id: room.id,
    status: room.status,
    topic: room.topic ?? undefined,
    topic_tags: room.topic_tags,
    maxMessages: room.max_messages,
    messageCount,
    startedAt: room.started_at ? new Date(room.started_at).getTime() : Date.now(),
    agents: [],
  };

  const localMessages: Message[] = recentMessages.map((m) => ({
    id: m.id,
    roomId: m.room_id,
    agentId: m.agent_id ?? '',
    content: m.content,
    tokenCount: 0,
    createdAt: new Date(m.created_at).getTime(),
  }));

  const result = checker.check({
    room: localRoom,
    recentMessages: localMessages,
    totalTokensUsed,
  });

  const descriptive = describeReason(result.reason, {
    messageCount,
    maxMessages: room.max_messages,
    totalTokensUsed,
    budget: (checker as any)['tokenBudget'],
  });

  return { shouldStop: result.shouldStop, reason: descriptive };
}

function describeReason(
  reason: string | null,
  ctx: { messageCount: number; maxMessages: number; totalTokensUsed: number; budget: number }
): string {
  switch (reason) {
    case 'admin_override':
      return `admin_override: room status changed to "concluded"`;
    case 'hard_cap':
      return `hard_cap: ${ctx.messageCount} messages reached max ${ctx.maxMessages}`;
    case 'token_budget':
      return `token_budget: ${ctx.totalTokensUsed} tokens used, budget is ${ctx.budget}`;
    case 'time_limit':
      return `time_limit: room exceeded max duration`;
    case 'repetition':
      return `convergence: last 3 messages are highly similar, conversation is circular`;
    case 'natural_end':
      return `natural_end: last message contains conclusion marker`;
    default:
      return '';
  }
}

// ----------------------------------------------------------------------------
// Jaccard helpers
// ----------------------------------------------------------------------------
function pairwiseMaxJaccard(messages: Message[]): number {
  if (messages.length < 2) return 0;
  let max = 0;
  for (let i = 0; i < messages.length - 1; i++) {
    for (let j = i + 1; j < messages.length; j++) {
      const s = jaccardSimilarity(messages[i].content, messages[j].content);
      if (s > max) max = s;
    }
  }
  return max;
}

function tokenize(text: string): Set<string> {
  const words = (text ?? '').toLowerCase().match(/[a-zà-ỹ0-9]+/giu) || [];
  return new Set(words.filter((w) => w.length >= 2));
}

function jaccardSimilarity(a: string, b: string): number {
  const setA = tokenize(a);
  const setB = tokenize(b);
  if (setA.size === 0 && setB.size === 0) return 1.0;
  if (setA.size === 0 || setB.size === 0) return 0.0;

  let intersection = 0;
  for (const word of setA) {
    if (setB.has(word)) intersection++;
  }
  const union = setA.size + setB.size - intersection;
  return union === 0 ? 0 : intersection / union;
}
