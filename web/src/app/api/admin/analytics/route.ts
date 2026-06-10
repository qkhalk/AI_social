import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/admin/require-admin";

/**
 * GET /api/admin/analytics — aggregated stats for the analytics dashboard.
 * Queries tables readable by admin role.
 */
export async function GET() {
  try {
    const supabase = await createClient();
    const adminErr = await requireAdmin(supabase);
    if (adminErr) return adminErr;

    // Message counts per agent (top agents by activity)
    const { data: messagesByAgent } = await supabase
      .from("messages")
      .select("agent_id, agents(name)")
      .not("agent_id", "is", null);

    // Aggregate message counts per agent
    const agentMessageMap = new Map<string, { name: string; count: number }>();
    for (const msg of messagesByAgent ?? []) {
      const agent = msg.agents as unknown as { name: string } | null;
      const name = agent?.name ?? "Unknown";
      const id = msg.agent_id as string;
      const existing = agentMessageMap.get(id);
      if (existing) {
        existing.count++;
      } else {
        agentMessageMap.set(id, { name, count: 1 });
      }
    }

    const topAgents = Array.from(agentMessageMap.entries())
      .map(([id, { name, count }]) => ({ id, name, message_count: count }))
      .sort((a, b) => b.message_count - a.message_count)
      .slice(0, 10);

    // Messages per day (last 7 days)
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const { data: recentMessages } = await supabase
      .from("messages")
      .select("created_at")
      .gte("created_at", sevenDaysAgo.toISOString());

    const dailyCounts: Record<string, number> = {};
    for (const msg of recentMessages ?? []) {
      const day = new Date(msg.created_at).toISOString().split("T")[0];
      dailyCounts[day] = (dailyCounts[day] || 0) + 1;
    }

    const messagesPerDay = Object.entries(dailyCounts)
      .map(([date, count]) => ({ date, count }))
      .sort((a, b) => a.date.localeCompare(b.date));

    // Room status distribution
    const { data: roomsByStatus } = await supabase
      .from("rooms")
      .select("status");

    const statusCounts: Record<string, number> = {};
    for (const room of roomsByStatus ?? []) {
      statusCounts[room.status] = (statusCounts[room.status] || 0) + 1;
    }

    // Event counts by type (last 24h)
    const oneDayAgo = new Date();
    oneDayAgo.setDate(oneDayAgo.getDate() - 1);
    const { data: recentEvents } = await supabase
      .from("room_events")
      .select("event_type")
      .gte("created_at", oneDayAgo.toISOString());

    const eventCounts: Record<string, number> = {};
    for (const evt of recentEvents ?? []) {
      eventCounts[evt.event_type] = (eventCounts[evt.event_type] || 0) + 1;
    }

    return NextResponse.json({
      topAgents,
      messagesPerDay,
      roomStatusDistribution: statusCounts,
      recentEventCounts: eventCounts,
    });
  } catch {
    return NextResponse.json({ error: "Internal server error." }, { status: 500 });
  }
}

