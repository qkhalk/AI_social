/**
 * Functional wrapper for orchestrator-loop.ts compatibility.
 * Maps DB types (snake_case) to local types (camelCase).
 */
import type { RoomWithAgents, Message as DbMessage } from '../types';
import { TurnSelector } from './turn-selector-class';
import type { Agent as DbAgent } from '../types';
import type { Agent } from './types';

export function selectNextAgent(
  room: RoomWithAgents,
  recentMessages: DbMessage[]
): DbAgent | null {
  const id = new TurnSelector().selectNextAgent({
    room: {
      id: room.id,
      status: room.status,
      topic: room.topic ?? undefined,
      topic_tags: room.topic_tags,
      maxMessages: room.max_messages,
      messageCount: 0,
      startedAt: room.started_at ? new Date(room.started_at).getTime() : Date.now(),
      agents: room.agents.map((a) => ({
        id: a.id,
        name: a.name,
        model: a.model_name,
        systemPrompt: a.system_prompt,
        topics: a.expertise_keywords,
        expertise_keywords: a.expertise_keywords,
        personality_traits: a.personality_traits,
        is_active: a.is_active,
      })),
    },
    recentMessages: recentMessages.map((m) => ({
      id: m.id,
      roomId: m.room_id,
      agentId: m.agent_id ?? '',
      content: m.content,
      tokenCount: 0,
      createdAt: new Date(m.created_at).getTime(),
    })),
  });

  if (!id) return null;
  return room.agents.find((a) => a.id === id) ?? null;
}
