/**
 * Local type aliases used by tests.
 *
 * These mirror `src/types/index.ts` but are kept here as a standalone module so
 * tests can import from `src/orchestrator/types` without depending on the
 * real types module (which exports snake_case field names matching the DB).
 *
 * Conventions here use camelCase to match the test fixtures.
 */

export interface Agent {
  id: string;
  name: string;
  model: string;
  systemPrompt: string;

  // Optional fields used by TurnSelector / scoring
  topics?: string[];
  expertise_keywords?: string[];
  personality_traits?: { talkativeness?: number; [k: string]: number };
  is_active?: boolean;
}

export interface Room {
  id: string;
  status: 'waiting' | 'active' | 'paused' | 'concluded' | 'archived';
  topic?: string | null;
  topic_tags?: string[];
  maxMessages: number;
  messageCount: number;
  startedAt: number;
  agents: Agent[];
}

export interface Message {
  id: string;
  roomId: string;
  agentId: string;
  content: string;
  tokenCount: number;
  createdAt: number;
}

export type TerminationReason =
  | 'admin_override'
  | 'hard_cap'
  | 'token_budget'
  | 'time_limit'
  | 'repetition'
  | 'natural_end';

export interface TerminationResult {
  shouldStop: boolean;
  reason: TerminationReason | string | null;
}

export interface TurnSelectionContext {
  room: Room;
  recentMessages: Message[];
  totalMessagesByAgent?: Map<string, number>;
}

export interface TerminationCheckContext {
  room: Room;
  recentMessages: Message[];
  totalTokensUsed?: number;
}
