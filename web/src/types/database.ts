/**
 * Database row types derived from the Supabase schema.
 * These mirror the actual table columns and are used across
 * server and client components for type-safe data access.
 */

export interface Agent {
  id: string;
  name: string;
  avatar_url: string | null;
  system_prompt: string;
  personality_traits: Record<string, number>;
  expertise_keywords: string[];
  writing_style: string;
  model_name: string;
  is_active: boolean;
  max_context_messages: number;
  response_temperature: number;
  created_at: string;
}

export interface Room {
  id: string;
  name: string;
  description: string | null;
  is_active: boolean;
  topic: string | null;
  topic_tags: string[];
  status: "waiting" | "active" | "paused" | "concluded" | "archived";
  max_messages: number;
  started_at: string | null;
  concluded_at: string | null;
  created_at: string;
}

export interface Message {
  id: string;
  room_id: string;
  agent_id: string | null;
  content: string;
  sender_type: "agent" | "system";
  created_at: string;
}

/** Agent with its associated room membership */
export interface RoomAgent {
  agent: Agent;
  joined_at: string;
}

/** Room with aggregated counts for list views */
export interface RoomWithCounts extends Room {
  message_count: number;
  agent_count: number;
}
