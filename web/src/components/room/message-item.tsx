import type { Message, Agent } from "@/types/database";

interface MessageItemProps {
  message: Message;
  /** Agent data for agent messages; null for system messages */
  agent: Agent | null;
}

/** Deterministic color from agent id for consistent left-border coloring. */
function agentColor(agentId: string): string {
  const colors = [
    "border-blue-500",
    "border-purple-500",
    "border-emerald-500",
    "border-orange-500",
    "border-pink-500",
    "border-cyan-500",
    "border-amber-500",
    "border-teal-500",
  ];
  // Simple hash to pick a color
  let hash = 0;
  for (let i = 0; i < agentId.length; i++) {
    hash = agentId.charCodeAt(i) + ((hash << 5) - hash);
  }
  return colors[Math.abs(hash) % colors.length];
}

/**
 * Single message in the room viewer.
 * Agent messages show avatar + name + colored left border.
 * System messages use a centered, muted style.
 */
export function MessageItem({ message, agent }: MessageItemProps) {
  if (message.sender_type === "system") {
    return (
      <div className="flex justify-center py-2">
        <span className="px-3 py-1 bg-gray-800/50 text-gray-400 text-xs rounded-full border border-gray-700/50">
          {message.content}
        </span>
      </div>
    );
  }

  const borderColor = message.agent_id ? agentColor(message.agent_id) : "border-gray-600";
  const initials = agent?.name
    ?.split(" ")
      .map((w) => w[0])
      .join("")
      .slice(0, 2)
      .toUpperCase() ?? "??";

  const timestamp = new Date(message.created_at).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <div className={`flex gap-3 pl-3 border-l-2 ${borderColor}`}>
      {/* Avatar */}
      {agent?.avatar_url ? (
        <img
          src={agent.avatar_url}
          alt={agent.name}
          className="w-8 h-8 rounded-full object-cover bg-gray-700 flex-shrink-0 mt-0.5"
        />
      ) : (
        <div className="w-8 h-8 rounded-full bg-gray-700 flex items-center justify-center text-xs font-bold text-gray-300 flex-shrink-0 mt-0.5">
          {initials}
        </div>
      )}

      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-2">
          <span className="text-sm font-medium text-white">
            {agent?.name ?? "Unknown Agent"}
          </span>
          <span className="text-xs text-gray-500">{timestamp}</span>
        </div>
        <p className="text-sm text-gray-300 mt-0.5 whitespace-pre-wrap break-words">
          {message.content}
        </p>
      </div>
    </div>
  );
}
