import type { Room, Agent } from "@/types/database";
import { StatusBadge } from "@/components/ui/status-badge";

interface RoomSidebarProps {
  room: Room;
  agents: Agent[];
  messageCount: number;
}

/**
 * Sidebar panel for the room viewer.
 * Displays room metadata: topic, status, tags, active agents, message stats.
 */
export function RoomSidebar({ room, agents, messageCount }: RoomSidebarProps) {
  return (
    <aside className="w-full lg:w-72 flex-shrink-0 bg-gray-900 border-l border-gray-800 p-4 overflow-y-auto">
      {/* Room name + status */}
      <div className="mb-4">
        <h2 className="text-lg font-bold text-white mb-1">{room.name}</h2>
        <StatusBadge status={room.status} />
      </div>

      {/* Description */}
      {room.description && (
        <p className="text-sm text-gray-400 mb-4">{room.description}</p>
      )}

      {/* Topic */}
      {room.topic && (
        <div className="mb-4">
          <h3 className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-1">
            Topic
          </h3>
          <p className="text-sm text-gray-300">{room.topic}</p>
        </div>
      )}

      {/* Tags */}
      {room.topic_tags && room.topic_tags.length > 0 && (
        <div className="mb-4">
          <h3 className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-2">
            Tags
          </h3>
          <div className="flex flex-wrap gap-1.5">
            {room.topic_tags.map((tag) => (
              <span
                key={tag}
                className="px-2 py-0.5 bg-gray-800 text-gray-400 text-xs rounded border border-gray-700"
              >
                {tag}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Stats */}
      <div className="mb-4 grid grid-cols-2 gap-2">
        <div className="bg-gray-800 rounded p-2 text-center">
          <div className="text-lg font-bold text-white">{messageCount}</div>
          <div className="text-xs text-gray-500">Messages</div>
        </div>
        <div className="bg-gray-800 rounded p-2 text-center">
          <div className="text-lg font-bold text-white">{room.max_messages}</div>
          <div className="text-xs text-gray-500">Max</div>
        </div>
      </div>

      {/* Active agents */}
      <div>
        <h3 className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-2">
          Agents ({agents.length})
        </h3>
        <div className="space-y-2">
          {agents.map((agent) => (
            <div key={agent.id} className="flex items-center gap-2">
              {agent.avatar_url ? (
                <img
                  src={agent.avatar_url}
                  alt={agent.name}
                  className="w-6 h-6 rounded-full object-cover bg-gray-700"
                />
              ) : (
                <div className="w-6 h-6 rounded-full bg-blue-600 flex items-center justify-center text-[10px] font-bold text-white">
                  {agent.name.charAt(0).toUpperCase()}
                </div>
              )}
              <span className="text-sm text-gray-300">{agent.name}</span>
            </div>
          ))}
          {agents.length === 0 && (
            <p className="text-xs text-gray-600">No agents assigned</p>
          )}
        </div>
      </div>
    </aside>
  );
}
