import { getSupabaseClient } from './supabase-client';
import { generateEmbedding } from './embedding-service';
import { extractMemoryCandidates } from './memory-extraction-heuristics';
import { AgentMemory, ConversationSummary, Message } from '../types';

/**
 * Store a single memory for an agent. Generates embedding automatically.
 * Memory failures are logged but never propagate — memories are best-effort.
 */
export async function storeMemory(
  agentId: string,
  roomId: string | null,
  memoryType: 'episodic' | 'semantic' | 'summary',
  content: string,
  importanceScore: number = 0.5
): Promise<void> {
  try {
    const embedding = await generateEmbedding(content);
    const client = getSupabaseClient();

    const { error } = await client.from('agent_memories').insert({
      agent_id: agentId,
      room_id: roomId,
      memory_type: memoryType,
      content,
      embedding: `[${embedding.join(',')}]`,
      importance_score: importanceScore,
    });

    if (error) {
      console.error(`[memory-service] Failed to store memory: ${error.message}`);
    }
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error(`[memory-service] storeMemory error: ${msg}`);
  }
}

/**
 * Retrieve memories most relevant to a query using cosine similarity via pgvector.
 * Returns top-N matches ranked by similarity score.
 */
export async function retrieveRelevantMemories(
  agentId: string,
  queryEmbedding: number[],
  limit: number = 3
): Promise<AgentMemory[]> {
  try {
    const client = getSupabaseClient();
    const vectorStr = `[${queryEmbedding.join(',')}]`;

    // pgvector cosine distance: smaller distance = more similar
    const { data, error } = await client.rpc('match_agent_memories', {
      query_embedding: vectorStr,
      match_agent_id: agentId,
      match_limit: limit,
    });

    if (error) {
      // Fallback: if RPC function doesn't exist, fetch recent memories
      console.warn(`[memory-service] RPC match failed, falling back to recent: ${error.message}`);
      return fetchRecentMemories(agentId, limit);
    }

    return (data as AgentMemory[]) || [];
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error(`[memory-service] retrieveRelevantMemories error: ${msg}`);
    return [];
  }
}

/**
 * Fallback: fetch most recent memories for an agent when similarity search is unavailable.
 */
async function fetchRecentMemories(agentId: string, limit: number): Promise<AgentMemory[]> {
  try {
    const client = getSupabaseClient();
    const { data, error } = await client
      .from('agent_memories')
      .select('*')
      .eq('agent_id', agentId)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) {
      console.error(`[memory-service] fetchRecentMemories error: ${error.message}`);
      return [];
    }
    return (data as AgentMemory[]) || [];
  } catch {
    return [];
  }
}

/**
 * Store a conversation summary for a room.
 * Called periodically to compress conversation history.
 */
export async function storeConversationSummary(
  roomId: string,
  summaryText: string,
  messageCount: number
): Promise<void> {
  try {
    const client = getSupabaseClient();
    const { error } = await client.from('conversation_summaries').insert({
      room_id: roomId,
      summary_text: summaryText,
      message_count: messageCount,
    });

    if (error) {
      console.error(`[memory-service] Failed to store summary: ${error.message}`);
    }
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error(`[memory-service] storeConversationSummary error: ${msg}`);
  }
}

/**
 * Get the most recent summary for a room, if one exists.
 */
export async function getLatestSummary(roomId: string): Promise<ConversationSummary | null> {
  try {
    const client = getSupabaseClient();
    const { data, error } = await client
      .from('conversation_summaries')
      .select('*')
      .eq('room_id', roomId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      console.error(`[memory-service] getLatestSummary error: ${error.message}`);
      return null;
    }
    return data as ConversationSummary | null;
  } catch {
    return null;
  }
}

/**
 * Extract key memories from a conversation using heuristic pattern matching.
 * Delegates pattern detection to memory-extraction-heuristics module.
 */
export async function extractMemoriesFromConversation(
  roomId: string,
  agentId: string,
  messages: Message[]
): Promise<void> {
  const agentMessages = messages.filter((m) => m.agent_id === agentId);

  for (const msg of agentMessages) {
    const memories = extractMemoryCandidates(msg.content);
    for (const mem of memories) {
      await storeMemory(agentId, roomId, mem.type, mem.content, mem.importance);
    }
  }
}
