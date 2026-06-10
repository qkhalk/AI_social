export interface Agent {
  id: string;
  name: string;
  system_prompt: string;
  personality_traits: Record<string, number>;
  expertise_keywords: string[];
  writing_style: string;
  model_name: string;
  is_active: boolean;
  max_context_messages: number;
  response_temperature: number;
  avatar_url: string | null;
  created_at: string;
}

export interface Room {
  id: string;
  name: string;
  description: string | null;
  topic: string | null;
  topic_tags: string[];
  status: 'waiting' | 'active' | 'paused' | 'concluded' | 'archived';
  max_messages: number;
  is_active: boolean;
  started_at: string | null;
  concluded_at: string | null;
  created_at: string;
}

export interface Message {
  id: string;
  room_id: string;
  agent_id: string | null;
  content: string;
  sender_type: 'agent' | 'system';
  created_at: string;
}

export interface RoomAgent {
  room_id: string;
  agent_id: string;
  joined_at: string;
}

// Convenience: room with its participating agents pre-joined
export interface RoomWithAgents extends Room {
  agents: Agent[];
}

export interface TerminationResult {
  shouldStop: boolean;
  reason: string;
}

export interface LLMResponse {
  content: string;
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

export interface TokenUsageEntry {
  agent_id: string;
  room_id: string;
  model_name: string;
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  cost_usd: number;
}

export interface AgentMemory {
  id: string;
  agent_id: string;
  room_id: string | null;
  memory_type: 'episodic' | 'semantic' | 'summary';
  content: string;
  embedding: number[] | null;
  importance_score: number;
  created_at: string;
}

export interface ConversationSummary {
  id: string;
  room_id: string;
  summary_text: string;
  message_count: number;
  created_at: string;
}
