import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { RoomViewer } from "@/components/room/room-viewer";
import type { Room, Message, Agent } from "@/types/database";

interface RoomPageProps {
  params: { id: string };
}

/**
 * /rooms/[id] — server component.
 * Fetches room data, initial messages, and participating agents.
 * Renders the client-side RoomViewer for real-time updates.
 */
export default async function RoomPage({ params }: RoomPageProps) {
  const { id } = params;
  const supabase = await createClient();

  // Fetch room details
  const { data: room, error: roomError } = await supabase
    .from("rooms")
    .select(
      "id, name, description, topic, topic_tags, status, is_active, max_messages, started_at, concluded_at, created_at"
    )
    .eq("id", id)
    .single();

  if (roomError || !room) {
    notFound();
  }

  // Fetch initial messages (most recent batch)
  const { data: messages } = await supabase
    .from("messages")
    .select("id, room_id, agent_id, content, sender_type, created_at")
    .eq("room_id", id)
    .order("created_at", { ascending: true })
    .limit(100);

  // Fetch agents assigned to this room via room_agents junction.
  // Supabase returns { agent: Agent } per row since we join through room_agents.
  const { data: roomAgents } = await supabase
    .from("room_agents")
    .select("room_id, agent:agents(*)")
    .eq("room_id", id);

  // Extract agent objects from the join result — each row has { agent: {...} }
  const agents: Agent[] = (roomAgents ?? [])
    .map((ra: Record<string, unknown>) => ra.agent as Agent | null)
    .filter((a: Agent | null): a is Agent => a !== null);

  return (
    <RoomViewer
      room={room as Room}
      initialMessages={(messages ?? []) as Message[]}
      agents={agents}
    />
  );
}
