"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { StatusBadge } from "@/components/ui/status-badge";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import type { Room, RoomWithCounts } from "@/types/database";

type StatusFilter = "all" | "active" | "concluded" | "archived";

/**
 * Client component: list of rooms with status filter, message count,
 * and active agent count. Fetches from Supabase on mount.
 */
export function RoomList() {
  const [rooms, setRooms] = useState<RoomWithCounts[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<StatusFilter>("all");

  useEffect(() => {
    async function fetchRooms() {
      const supabase = createClient();

      try {
        // Fetch rooms with aggregated counts via RPC-free approach:
        // two separate queries merged client-side
        const [roomsRes, messagesRes, roomAgentsRes] = await Promise.all([
          supabase
            .from("rooms")
            .select("id, name, description, topic, topic_tags, status, is_active, max_messages, started_at, concluded_at, created_at")
            .order("created_at", { ascending: false }),
          supabase.from("messages").select("room_id"),
          supabase.from("room_agents").select("room_id, agent_id"),
        ]);

        if (roomsRes.error) {
          setError(roomsRes.error.message);
          return;
        }

        // Count messages per room
        const msgCounts: Record<string, number> = {};
        for (const m of messagesRes.data ?? []) {
          msgCounts[m.room_id] = (msgCounts[m.room_id] ?? 0) + 1;
        }

        // Count agents per room
        const agentCounts: Record<string, number> = {};
        for (const ra of roomAgentsRes.data ?? []) {
          agentCounts[ra.room_id] = (agentCounts[ra.room_id] ?? 0) + 1;
        }

        const enriched: RoomWithCounts[] = (roomsRes.data ?? []).map((room) => ({
          ...room,
          message_count: msgCounts[room.id] ?? 0,
          agent_count: agentCounts[room.id] ?? 0,
        }));

        setRooms(enriched);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load rooms");
      } finally {
        setLoading(false);
      }
    }

    fetchRooms();
  }, []);

  const filtered = filter === "all" ? rooms : rooms.filter((r) => r.status === filter);

  if (loading) {
    return (
      <div className="py-12">
        <LoadingSpinner label="Loading rooms..." />
      </div>
    );
  }

  if (error) {
    return (
      <div className="py-8 text-center">
        <p className="text-red-400 text-sm">{error}</p>
      </div>
    );
  }

  return (
    <div>
      {/* Filter tabs */}
      <div className="flex gap-2 mb-6">
        {(["all", "active", "concluded", "archived"] as StatusFilter[]).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-3 py-1.5 text-sm rounded border transition-colors ${
              filter === f
                ? "bg-blue-600 border-blue-500 text-white"
                : "bg-gray-800 border-gray-700 text-gray-400 hover:text-gray-300"
            }`}
          >
            {f.charAt(0).toUpperCase() + f.slice(1)}
          </button>
        ))}
      </div>

      {/* Room grid */}
      {filtered.length === 0 ? (
        <p className="text-gray-500 text-sm py-8 text-center">
          No rooms found{filter !== "all" ? ` with status "${filter}"` : ""}.
        </p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map((room) => (
            <Link
              key={room.id}
              href={`/rooms/${room.id}`}
              className="block bg-gray-800 rounded-lg border border-gray-700 p-4 hover:border-gray-600 transition-colors"
            >
              <div className="flex items-start justify-between gap-2 mb-2">
                <h3 className="text-white font-medium text-sm truncate">{room.name}</h3>
                <StatusBadge status={room.status} />
              </div>

              {room.topic && (
                <p className="text-gray-400 text-xs mb-2 line-clamp-2">{room.topic}</p>
              )}

              {room.topic_tags && room.topic_tags.length > 0 && (
                <div className="flex flex-wrap gap-1 mb-3">
                  {room.topic_tags.slice(0, 3).map((tag) => (
                    <span
                      key={tag}
                      className="px-1.5 py-0.5 bg-gray-700 text-gray-400 text-[10px] rounded"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              )}

              <div className="flex items-center gap-4 text-xs text-gray-500">
                <span>{room.message_count} messages</span>
                <span>{room.agent_count} agents</span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
