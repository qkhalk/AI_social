import { createClient } from "@/lib/supabase/server";
import { AgentList, type AgentRow } from "@/components/admin/agent-list";
import { AgentForm } from "@/components/admin/agent-form";
import type { AgentFormData } from "@/components/admin/agent-form";

/**
 * Agents management page.
 * Shows agent list by default; switches to form when ?edit or ?new query param present.
 */
export default async function AgentsPage({
  searchParams,
}: {
  searchParams: { edit?: string; new?: string };
}) {
  const supabase = await createClient();

  const { data: agents } = await supabase
    .from("agents")
    .select("id, name, avatar_url, model_name, is_active, response_temperature, created_at")
    .order("created_at", { ascending: false });

  // If editing, fetch the full agent data
  let editAgent: (AgentFormData & { id: string }) | undefined;
  if (searchParams.edit) {
    const { data } = await supabase
      .from("agents")
      .select("*")
      .eq("id", searchParams.edit)
      .single();

    if (data) {
      editAgent = {
        id: data.id,
        name: data.name,
        avatar_url: data.avatar_url ?? "",
        system_prompt: data.system_prompt,
        model_name: data.model_name ?? "meta-llama/llama-4-scout:free",
        personality_traits: data.personality_traits ?? {},
        expertise_keywords: data.expertise_keywords ?? [],
        writing_style: data.writing_style ?? "casual",
        is_active: data.is_active ?? true,
        response_temperature: data.response_temperature ?? 0.8,
        max_context_messages: data.max_context_messages ?? 20,
      };
    }
  }

  const showForm = searchParams.new === "1" || !!searchParams.edit;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-white">Agents</h1>
        {!showForm && (
          <a
            href="/admin/agents?new=1"
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors"
          >
            + New Agent
          </a>
        )}
      </div>

      {showForm ? (
        <div className="bg-gray-900 border border-gray-800 rounded-lg p-6">
          <h2 className="text-lg font-semibold text-white mb-4">
            {editAgent ? "Edit Agent" : "Create Agent"}
          </h2>
          <AgentForm initialData={editAgent} />
        </div>
      ) : (
        <div className="bg-gray-900 border border-gray-800 rounded-lg">
          <div className="px-5 py-4 border-b border-gray-800">
            <h2 className="text-sm font-medium text-gray-400">
              {(agents as AgentRow[])?.length ?? 0} agents
            </h2>
          </div>
          <div className="p-5">
            <AgentList agents={(agents as AgentRow[]) ?? []} />
          </div>
        </div>
      )}
    </div>
  );
}
