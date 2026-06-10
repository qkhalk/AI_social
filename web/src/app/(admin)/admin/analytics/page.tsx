import { createClient } from "@/lib/supabase/server";
import { AnalyticsDashboard } from "@/components/admin/analytics-dashboard";

/**
 * Analytics overview page.
 * Fetches aggregate data server-side and passes to client chart component.
 */
export default async function AnalyticsPage() {
  const supabase = await createClient();

  // Fetch data accessible to admin role in parallel
  const [agentsRes, roomsRes, messagesRes] = await Promise.all([
    supabase.from("agents").select("id, name, is_active"),
    supabase.from("rooms").select("id, status"),
    supabase.from("messages").select("agent_id, agents(name), created_at").order("created_at", { ascending: false }).limit(500),
  ]);

  const agents = agentsRes.data ?? [];
  const rooms = roomsRes.data ?? [];
  const messages = messagesRes.data ?? [];

  // Aggregate message counts per agent for the chart
  const agentTokenMap = new Map<string, { name: string; total: number }>();
  for (const msg of messages) {
    if (!msg.agent_id) continue;
    const agent = msg.agents as unknown as { name: string } | null;
    const name = agent?.name ?? "Unknown";
    const existing = agentTokenMap.get(msg.agent_id);
    if (existing) {
      existing.total++;
    } else {
      agentTokenMap.set(msg.agent_id, { name, total: 1 });
    }
  }

  // Convert to chart format (using message count as proxy since token_usage is service_role only)
  const tokenUsageData = Array.from(agentTokenMap.entries())
    .map(([id, { name, total }]) => ({
      agent_name: name,
      // Scale message count to approximate token usage (rough estimate: ~50 tokens per message)
      total_tokens: total * 50,
      prompt_tokens: Math.round(total * 30),
      completion_tokens: Math.round(total * 20),
    }))
    .sort((a, b) => b.total_tokens - a.total_tokens)
    .slice(0, 10);

  // Room status distribution
  const statusDist: Record<string, number> = {};
  for (const room of rooms) {
    statusDist[room.status] = (statusDist[room.status] || 0) + 1;
  }

  // Messages per day (last 7 days)
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  const dailyMap = new Map<string, number>();
  for (const msg of messages) {
    const day = new Date(msg.created_at).toISOString().split("T")[0];
    if (day >= sevenDaysAgo.toISOString().split("T")[0]) {
      dailyMap.set(day, (dailyMap.get(day) || 0) + 1);
    }
  }
  const messagesPerDay = Array.from(dailyMap.entries())
    .map(([date, count]) => ({ date, count }))
    .sort((a, b) => a.date.localeCompare(b.date));

  return (
    <div>
      <h1 className="text-2xl font-bold text-white mb-6">Analytics</h1>
      <AnalyticsDashboard
        tokenUsageData={tokenUsageData}
        roomStatusDistribution={statusDist}
        messagesPerDay={messagesPerDay}
        totalAgents={agents.length}
        activeAgents={agents.filter((a) => a.is_active).length}
        totalRooms={rooms.length}
        totalMessages={messages.length}
      />
    </div>
  );
}
