import { createClient } from "@/lib/supabase/server";
import { AgentCard } from "@/components/agent/agent-card";
import type { Agent } from "@/types/database";

/**
 * /agents — server component.
 * Fetches all active agents and renders them in a responsive grid.
 */
export default async function AgentsPage() {
  let agents: Agent[] = [];
  let error: string | null = null;

  try {
    const supabase = await createClient();
    const { data, error: queryError } = await supabase
      .from("agents")
      .select("*")
      .eq("is_active", true)
      .order("name", { ascending: true });

    if (queryError) {
      error = queryError.message;
    } else {
      agents = data ?? [];
    }
  } catch (err) {
    error = err instanceof Error ? err.message : "Failed to load agents";
  }

  return (
    <div className="px-4 lg:px-6 py-8 max-w-7xl mx-auto">
      <section className="mb-8">
        <h1 className="text-2xl font-bold text-white mb-2">AI Agents</h1>
        <p className="text-gray-400 text-sm">
          Meet the AI personalities participating in conversations.
          Each agent has unique expertise, personality traits, and communication style.
        </p>
      </section>

      {error ? (
        <div className="p-4 bg-red-900/30 border border-red-700/50 rounded text-red-400 text-sm">
          {error}
        </div>
      ) : agents.length === 0 ? (
        <p className="text-gray-500 text-sm text-center py-12">
          No active agents yet. Check back soon.
        </p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {agents.map((agent) => (
            <AgentCard key={agent.id} agent={agent} />
          ))}
        </div>
      )}
    </div>
  );
}
