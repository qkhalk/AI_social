import { createClient } from "@/lib/supabase/server";
import { RoomList, type RoomRow } from "@/components/admin/room-list";
import { RoomForm } from "@/components/admin/room-form";
import type { RoomFormData } from "@/components/admin/room-form";

/**
 * Rooms management page.
 * Shows room list by default; switches to form when ?edit or ?new present.
 */
export default async function RoomsPage({
  searchParams,
}: {
  searchParams: { edit?: string; new?: string };
}) {
  const supabase = await createClient();

  // Fetch rooms
  const { data: rooms } = await supabase
    .from("rooms")
    .select(`
      id, name, description, status, topic, max_messages, created_at
    `)
    .order("created_at", { ascending: false });

  // Bulk-fetch agent and message counts (avoids N+1 per-room queries)
  const roomIds = (rooms ?? []).map((r) => r.id);
  const [agentCountRes, msgCountRes] = await Promise.all([
    roomIds.length > 0
      ? supabase.from("room_agents").select("room_id").in("room_id", roomIds)
      : { data: [] as { room_id: string }[] },
    roomIds.length > 0
      ? supabase.from("messages").select("room_id").in("room_id", roomIds)
      : { data: [] as { room_id: string }[] },
  ]);

  // Aggregate counts client-side from bulk results
  const agentCounts = new Map<string, number>();
  for (const row of agentCountRes.data ?? []) {
    agentCounts.set(row.room_id, (agentCounts.get(row.room_id) ?? 0) + 1);
  }
  const msgCounts = new Map<string, number>();
  for (const row of msgCountRes.data ?? []) {
    msgCounts.set(row.room_id, (msgCounts.get(row.room_id) ?? 0) + 1);
  }

  const roomRows: RoomRow[] = (rooms ?? []).map((room) => ({
    ...room,
    agent_count: agentCounts.get(room.id) ?? 0,
    message_count: msgCounts.get(room.id) ?? 0,
  }));

  // Fetch active agents for the form multi-select
  const { data: activeAgents } = await supabase
    .from("agents")
    .select("id, name")
    .eq("is_active", true)
    .order("name");

  // If editing, fetch full room data + assigned agent IDs
  let editRoom: (RoomFormData & { id: string }) | undefined;
  if (searchParams.edit) {
    const { data: room } = await supabase
      .from("rooms")
      .select("*")
      .eq("id", searchParams.edit)
      .single();

    if (room) {
      const { data: assignedAgents } = await supabase
        .from("room_agents")
        .select("agent_id")
        .eq("room_id", room.id);

      editRoom = {
        id: room.id,
        name: room.name,
        description: room.description ?? "",
        topic: room.topic ?? "",
        topic_tags: room.topic_tags ?? [],
        max_messages: room.max_messages ?? 50,
        agent_ids: (assignedAgents ?? []).map((a) => a.agent_id),
      };
    }
  }

  const showForm = searchParams.new === "1" || !!searchParams.edit;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-white">Rooms</h1>
        {!showForm && (
          <a
            href="/admin/rooms?new=1"
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors"
          >
            + New Room
          </a>
        )}
      </div>

      {showForm ? (
        <div className="bg-gray-900 border border-gray-800 rounded-lg p-6">
          <h2 className="text-lg font-semibold text-white mb-4">
            {editRoom ? "Edit Room" : "Create Room"}
          </h2>
          <RoomForm
            initialData={editRoom}
            agents={(activeAgents ?? []).map((a) => ({ id: a.id, name: a.name }))}
          />
        </div>
      ) : (
        <div className="bg-gray-900 border border-gray-800 rounded-lg">
          <div className="px-5 py-4 border-b border-gray-800">
            <h2 className="text-sm font-medium text-gray-400">
              {roomRows.length} rooms
            </h2>
          </div>
          <div className="p-5">
            <RoomList rooms={roomRows} />
          </div>
        </div>
      )}
    </div>
  );
}
