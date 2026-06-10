import { RoomWithAgents, Agent, Message } from '../types';

interface ScoredAgent {
  agent: Agent;
  score: number;
}

/**
 * Select the next agent to speak in a room.
 * Excludes the last speaker to prevent self-reply, then scores candidates
 * by topic relevance, recency, talkativeness, and random noise.
 */
export function selectNextAgent(
  room: RoomWithAgents,
  recentMessages: Message[]
): Agent | null {
  const activeAgents = room.agents.filter((a) => a.is_active);
  if (activeAgents.length === 0) return null;

  // No messages yet — pick a random agent to start the conversation
  if (recentMessages.length === 0) {
    const idx = Math.floor(Math.random() * activeAgents.length);
    return activeAgents[idx];
  }

  // Most recent message determines who just spoke
  const lastSpeakerId = recentMessages[0].agent_id;

  // Exclude last speaker so agents take turns
  const candidates = activeAgents.filter((a) => a.id !== lastSpeakerId);
  if (candidates.length === 0) return activeAgents[0];

  const scored: ScoredAgent[] = candidates.map((agent) => ({
    agent,
    score: computeAgentScore(agent, room, recentMessages),
  }));

  // Sort descending by score, pick the top agent
  scored.sort((a, b) => b.score - a.score);
  return scored[0].agent;
}

function computeAgentScore(
  agent: Agent,
  room: RoomWithAgents,
  recentMessages: Message[]
): number {
  const topicScore = computeTopicRelevance(agent, room);
  const recencyScore = computeRecency(agent, recentMessages);
  const talkScore = computeTalkativeness(agent);
  const noise = Math.random();

  // Weighted sum: relevance and recency dominate, personality and noise add variety
  return topicScore * 0.3 + recencyScore * 0.3 + talkScore * 0.2 + noise * 0.2;
}

/** Overlap between agent expertise and room topic tags (0-1 normalized). */
function computeTopicRelevance(agent: Agent, room: RoomWithAgents): number {
  if (!room.topic_tags?.length || !agent.expertise_keywords?.length) return 0.5;

  const overlap = agent.expertise_keywords.filter((kw) =>
    room.topic_tags.some((tag) => tag.toLowerCase() === kw.toLowerCase())
  ).length;

  return Math.min(overlap / Math.max(room.topic_tags.length, 1), 1);
}

/** How long since this agent last spoke — longer gap = higher urgency to speak. */
function computeRecency(agent: Agent, recentMessages: Message[]): number {
  const lastIdx = recentMessages.findIndex((m) => m.agent_id === agent.id);
  if (lastIdx === -1) return 1; // Never spoke — high priority

  // Normalize: position 0 (most recent) = lowest score, end = highest
  return lastIdx / Math.max(recentMessages.length, 1);
}

/** Personality-driven talkativeness from traits JSONB (default 0.5). */
function computeTalkativeness(agent: Agent): number {
  return agent.personality_traits?.talkativeness ?? 0.5;
}
