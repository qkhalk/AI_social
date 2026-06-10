import { createClient } from "@/lib/supabase/server";
import Link from "next/link";
import { StatsCard } from "@/components/admin/stats-card";

/**
 * Admin dashboard overview.
 * Server component — fetches aggregate stats and recent events in parallel.
 */
export default async function AdminDashboard() {
  const supabase = await createClient();

  const [agentsRes, roomsRes, messagesRes, usersRes, eventsRes, activeRoomsRes] =
    await Promise.all([
      supabase.from("agents").select("id", { count: "exact", head: true }),
      supabase.from("rooms").select("id", { count: "exact", head: true }),
      supabase
        .from("messages")
        .select("id", { count: "exact", head: true })
        .gte("created_at", todayUTC()),
      supabase.from("profiles").select("id", { count: "exact", head: true }),
      supabase
        .from("room_events")
        .select("event_type, metadata, created_at, room_id")
        .order("created_at", { ascending: false })
        .limit(10),
      supabase
        .from("rooms")
        .select("id", { count: "exact", head: true })
        .eq("status", "active"),
    ]);

  const totalAgents = agentsRes.count ?? 0;
  const totalRooms = roomsRes.count ?? 0;
  const messagesToday = messagesRes.count ?? 0;
  const totalUsers = usersRes.count ?? 0;
  const activeRooms = activeRoomsRes.count ?? 0;
  const recentEvents = eventsRes.data ?? [];

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-2xl font-bold text-white">Dashboard</h1>
        <div className="flex gap-3">
          <Link
            href="/admin/agents"
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors"
          >
            + New Agent
          </Link>
          <Link
            href="/admin/rooms"
            className="px-4 py-2 bg-gray-800 hover:bg-gray-700 text-gray-200 text-sm font-medium rounded-lg border border-gray-700 transition-colors"
          >
            + New Room
          </Link>
        </div>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatsCard title="Active Rooms" value={activeRooms} subtitle={`${totalRooms} total`} />
        <StatsCard title="Total Agents" value={totalAgents} />
        <StatsCard title="Messages Today" value={messagesToday} />
        <StatsCard title="Total Users" value={totalUsers} />
      </div>

      {/* Recent events */}
      <div className="bg-gray-900 border border-gray-800 rounded-lg">
        <div className="px-5 py-4 border-b border-gray-800">
          <h2 className="text-lg font-semibold text-white">Recent Events</h2>
        </div>
        {recentEvents.length === 0 ? (
          <p className="p-5 text-gray-500 text-sm">No events yet.</p>
        ) : (
          <ul className="divide-y divide-gray-800">
            {recentEvents.map((evt) => (
              <li key={evt.room_id + evt.created_at} className="px-5 py-3 flex items-center justify-between">
                <div>
                  <span className="text-sm font-medium text-gray-200">
                    {formatEventType(evt.event_type)}
                  </span>
                  {evt.metadata?.agent_name && (
                    <span className="text-xs text-gray-500 ml-2">
                      by {evt.metadata.agent_name as string}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-3">
                  <Link
                    href={`/admin/rooms/${evt.room_id}`}
                    className="text-xs text-blue-400 hover:text-blue-300"
                  >
                    View Room
                  </Link>
                  <span className="text-xs text-gray-600">
                    {formatTime(evt.created_at)}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

/** Returns start-of-day UTC as ISO string for "today" filtering. */
function todayUTC(): string {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  return d.toISOString();
}

function formatEventType(type: string): string {
  return type
    .split("_")
    .map((w) => w[0].toUpperCase() + w.slice(1))
    .join(" ");
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
