import { getSupabaseClient } from './supabase-client';
import { RoomWithAgents, Message, Agent } from '../types';

/**
 * Fetch all active rooms with their participating agents pre-joined.
 * Uses Supabase relational query to avoid N+1 lookups.
 */
export async function fetchActiveRoomsWithAgents(): Promise<RoomWithAgents[]> {
  const client = getSupabaseClient();

  const { data: rooms, error: roomError } = await client
    .from('rooms')
    .select(`
      *,
      agents:room_agents(
        joined_at,
        agent:agents(*)
      )
    `)
    .eq('status', 'active')
    .eq('is_active', true);

  if (roomError) {
    throw new Error(`Failed to fetch active rooms: ${roomError.message}`);
  }

  if (!rooms) return [];

  // Flatten the nested join into RoomWithAgents shape
  return rooms.map((room: Record<string, unknown>) => {
    const rawAgents = (room.agents as Array<{ joined_at: string; agent: Agent }>) || [];
    return {
      ...room,
      agents: rawAgents.map((entry) => entry.agent),
    } as unknown as RoomWithAgents;
  });
}

/**
 * Fetch the most recent N messages in a room, newest first.
 * Caller reverses order when feeding to LLM context.
 */
export async function fetchRecentMessages(
  roomId: string,
  limit: number = 20
): Promise<Message[]> {
  const client = getSupabaseClient();

  const { data, error } = await client
    .from('messages')
    .select('*')
    .eq('room_id', roomId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    throw new Error(`Failed to fetch messages for room ${roomId}: ${error.message}`);
  }

  return (data as Message[]) || [];
}

/**
 * Insert an agent's response into the messages table.
 */
export async function insertAgentMessage(
  roomId: string,
  agentId: string,
  content: string
): Promise<void> {
  const client = getSupabaseClient();

  const { error } = await client.from('messages').insert({
    room_id: roomId,
    agent_id: agentId,
    content,
    sender_type: 'agent',
  });

  if (error) {
    throw new Error(`Failed to insert agent message: ${error.message}`);
  }
}

/**
 * Insert a system message (no agent author). Used for room lifecycle events.
 */
export async function insertSystemMessage(
  roomId: string,
  content: string
): Promise<void> {
  const client = getSupabaseClient();

  const { error } = await client.from('messages').insert({
    room_id: roomId,
    agent_id: null,
    content,
    sender_type: 'system',
  });

  if (error) {
    throw new Error(`Failed to insert system message: ${error.message}`);
  }
}

/**
 * Update room status. Sets concluded_at timestamp when concluding a room.
 */
export async function updateRoomStatus(
  roomId: string,
  status: string
): Promise<void> {
  const client = getSupabaseClient();

  const update: Record<string, unknown> = { status };

  if (status === 'concluded') {
    update.concluded_at = new Date().toISOString();
  }

  const { error } = await client
    .from('rooms')
    .update(update)
    .eq('id', roomId);

  if (error) {
    throw new Error(`Failed to update room ${roomId} status: ${error.message}`);
  }
}

/**
 * Get total message count for a room (used by termination checker).
 */
export async function getRoomMessageCount(roomId: string): Promise<number> {
  const client = getSupabaseClient();

  const { count, error } = await client
    .from('messages')
    .select('*', { count: 'exact', head: true })
    .eq('room_id', roomId);

  if (error) {
    throw new Error(`Failed to count messages for room ${roomId}: ${error.message}`);
  }

  return count ?? 0;
}
