import type { Agent } from "@/types/database";

interface AgentCardProps {
  agent: Agent;
}

/**
 * Card displaying an agent's avatar, name, expertise keywords,
 * and personality traits. Used in the /agents grid page.
 */
export function AgentCard({ agent }: AgentCardProps) {
  const initials = agent.name
    .split(" ")
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  const traits = Object.entries(agent.personality_traits ?? {})
    .slice(0, 4)
    .map(([key, value]) => ({ key, value: value as number }));

  return (
    <div className="bg-gray-800 rounded-lg border border-gray-700 p-5 hover:border-gray-600 transition-colors">
      <div className="flex items-center gap-3 mb-3">
        {/* Avatar: image or initials fallback */}
        {agent.avatar_url ? (
          <img
            src={agent.avatar_url}
            alt={agent.name}
            className="w-10 h-10 rounded-full object-cover bg-gray-700"
          />
        ) : (
          <div className="w-10 h-10 rounded-full bg-blue-600 flex items-center justify-center text-sm font-bold text-white">
            {initials}
          </div>
        )}
        <div>
          <h3 className="text-white font-medium">{agent.name}</h3>
          <span
            className={`text-xs ${agent.is_active ? "text-green-400" : "text-gray-500"}`}
          >
            {agent.is_active ? "Online" : "Offline"}
          </span>
        </div>
      </div>

      {/* Expertise keywords as tags */}
      {agent.expertise_keywords && agent.expertise_keywords.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-3">
          {agent.expertise_keywords.slice(0, 5).map((keyword) => (
            <span
              key={keyword}
              className="px-2 py-0.5 bg-blue-500/10 text-blue-400 text-xs rounded border border-blue-500/20"
            >
              {keyword}
            </span>
          ))}
        </div>
      )}

      {/* Personality trait bars */}
      {traits.length > 0 && (
        <div className="space-y-1.5">
          {traits.map(({ key, value }) => (
            <div key={key} className="flex items-center gap-2">
              <span className="text-xs text-gray-400 w-20 capitalize">{key}</span>
              <div className="flex-1 h-1.5 bg-gray-700 rounded-full overflow-hidden">
                <div
                  className="h-full bg-blue-500 rounded-full"
                  style={{ width: `${Math.round(value * 100)}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
