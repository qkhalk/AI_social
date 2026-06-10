import { createClient } from "@/lib/supabase/server";
import { safeDecryptServer } from "@/lib/encryption/decrypt-server";
import { notFound } from "next/navigation";
import Link from "next/link";
import { RoomControls } from "@/components/admin/room-controls";
import { RoomAgentManager } from "@/components/admin/room-agent-manager";

/** Encryption key shared between agent and web services */
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || "";

/**
 * Room detail page: displays room info, controls, agents, and message history.
 * Decrypts message content server-side before rendering.
 */
export default async function RoomDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const supabase = await createClient();

  // Fetch room details
  const { data: room } = await supabase
    .from("rooms")
    .select("*")
    .eq("id", params.id)
    .single();

  if (!room) notFound();

  // Fetch messages with agent names
  const { data: messages } = await supabase
    .from("messages")
    .select("id, content, sender_type, created_at, agent_id, agents(name, avatar_url)")
    .eq("room_id", params.id)
    .order("created_at", { ascending: true });

  // Decrypt message content server-side
  const decryptedMessages = (messages ?? []).map(
    (msg: Record<string, unknown>) => ({
      ...msg,
      content: ENCRYPTION_KEY
        ? safeDecryptServer(msg.content as string, ENCRYPTION_KEY)
        : (msg.content as string),
    })
  );

  // Fetch assigned agents
  const { data: roomAgents } = await supabase
    .from("room_agents")
    .select("agent_id, joined_at, agents(id, name, avatar_url)")
    .eq("room_id", params.id);

  // Fetch active agents not yet in room (for adding)
  const assignedIds = (roomAgents ?? []).map((ra) => ra.agent_id);
  const { data: availableAgents } = await supabase
    .from("agents")
    .select("id, name")
    .eq("is_active", true);

  const addableAgents = (availableAgents ?? []).filter(
    (a) => !assignedIds.includes(a.id)
  );

  const STATUS_BADGE: Record<string, string> = {
    waiting: "bg-yellow-900/50 text-yellow-400",
    active: "bg-green-900/50 text-green-400",
    paused: "bg-orange-900/50 text-orange-400",
    concluded: "bg-red-900/50 text-red-400",
    archived: "bg-gray-800 text-gray-500",
  };

  return (
    <div>
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <Link href="/admin/rooms" className="text-gray-500 hover:text-gray-300 text-sm">
          &larr; Rooms
        </Link>
        <h1 className="text-2xl font-bold text-white">{room.name}</h1>
        <span className={`px-2 py-0.5 rounded text-xs font-medium capitalize ${STATUS_BADGE[room.status] ?? "bg-gray-800 text-gray-400"}`}>
          {room.status}
        </span>
      </div>

      {/* Room info + controls */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
        <div className="lg:col-span-2 bg-gray-900 border border-gray-800 rounded-lg p-5">
          <h2 className="text-sm font-medium text-gray-400 mb-3">Details</h2>
          {room.description && <p className="text-gray-300 text-sm mb-2">{room.description}</p>}
          {room.topic && <p className="text-gray-400 text-sm">Topic: {room.topic}</p>}
          <div className="mt-3 flex items-center gap-4 text-xs text-gray-500">
            <span>Max messages: {room.max_messages}</span>
            <span>Created: {new Date(room.created_at).toLocaleDateString()}</span>
          </div>
          <div className="mt-4">
            <RoomControls roomId={room.id} currentStatus={room.status} />
          </div>
        </div>

        {/* Assigned agents */}
        <div className="bg-gray-900 border border-gray-800 rounded-lg p-5">
          <h2 className="text-sm font-medium text-gray-400 mb-3">
            Agents ({(roomAgents ?? []).length})
          </h2>
          <ul className="space-y-2 mb-4">
            {(roomAgents ?? []).map((ra: Record<string, unknown>) => {
              const agent = ra.agents as { id: string; name: string; avatar_url: string | null } | null;
              return (
                <li key={ra.agent_id as string} className="flex items-center gap-2 text-sm text-gray-300">
                  {agent?.avatar_url ? (
                    <img src={agent.avatar_url} alt="" className="w-6 h-6 rounded-full" />
                  ) : (
                    <div className="w-6 h-6 rounded-full bg-gray-700 flex items-center justify-center text-xs text-gray-400">
                      {agent?.name?.[0]?.toUpperCase()}
                    </div>
                  )}
                  {agent?.name ?? "Unknown"}
                </li>
              );
            })}
          </ul>
          <RoomAgentManager roomId={room.id} availableAgents={addableAgents} />
        </div>
      </div>

      {/* Message history */}
      <div className="bg-gray-900 border border-gray-800 rounded-lg">
        <div className="px-5 py-4 border-b border-gray-800">
          <h2 className="text-sm font-medium text-gray-400">
            Messages ({decryptedMessages.length})
          </h2>
        </div>
        {decryptedMessages.length === 0 ? (
          <p className="p-5 text-gray-500 text-sm">No messages yet.</p>
        ) : (
          <ul className="divide-y divide-gray-800/50 max-h-[600px] overflow-y-auto">
            {decryptedMessages.map((msg: Record<string, unknown>) => {
              const agent = msg.agents as { name: string; avatar_url: string | null } | null;
              return (
                <li key={msg.id as string} className="px-5 py-3">
                  <div className="flex items-center gap-2 mb-1">
                    {msg.sender_type === "system" ? (
                      <span className="text-xs font-medium text-gray-500">System</span>
                    ) : (
                      <span className="text-xs font-medium text-blue-400">{agent?.name ?? "Agent"}</span>
                    )}
                    <span className="text-xs text-gray-600">
                      {new Date(msg.created_at as string).toLocaleTimeString()}
                    </span>
                  </div>
                  <p className="text-sm text-gray-300">{msg.content as string}</p>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
