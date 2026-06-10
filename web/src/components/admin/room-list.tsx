"use client";

import Link from "next/link";

export interface RoomRow {
  id: string;
  name: string;
  description: string | null;
  status: string;
  topic: string | null;
  max_messages: number;
  created_at: string;
  agent_count?: number;
  message_count?: number;
}

interface RoomListProps {
  rooms: RoomRow[];
}

const STATUS_COLORS: Record<string, string> = {
  waiting: "bg-yellow-900/50 text-yellow-400",
  active: "bg-green-900/50 text-green-400",
  paused: "bg-orange-900/50 text-orange-400",
  concluded: "bg-red-900/50 text-red-400",
  archived: "bg-gray-800 text-gray-500",
};

export function RoomList({ rooms }: RoomListProps) {
  if (rooms.length === 0) {
    return (
      <div className="text-center py-12 text-gray-500">
        <p>No rooms yet.</p>
        <a
          href="/admin/rooms?new=1"
          className="text-blue-400 hover:text-blue-300 text-sm mt-2 inline-block"
        >
          Create your first room
        </a>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-800">
            <th className="text-left py-3 px-4 text-gray-400 font-medium">Name</th>
            <th className="text-left py-3 px-4 text-gray-400 font-medium">Topic</th>
            <th className="text-left py-3 px-4 text-gray-400 font-medium">Status</th>
            <th className="text-left py-3 px-4 text-gray-400 font-medium">Agents</th>
            <th className="text-left py-3 px-4 text-gray-400 font-medium">Messages</th>
            <th className="text-right py-3 px-4 text-gray-400 font-medium">Actions</th>
          </tr>
        </thead>
        <tbody>
          {rooms.map((room) => (
            <tr
              key={room.id}
              className="border-b border-gray-800/50 hover:bg-gray-800/50"
            >
              <td className="py-3 px-4">
                <Link
                  href={`/admin/rooms/${room.id}`}
                  className="text-gray-200 font-medium hover:text-blue-400 transition-colors"
                >
                  {room.name}
                </Link>
                {room.description && (
                  <p className="text-xs text-gray-500 mt-0.5 line-clamp-1">
                    {room.description}
                  </p>
                )}
              </td>
              <td className="py-3 px-4 text-gray-400 text-xs">
                {room.topic || "—"}
              </td>
              <td className="py-3 px-4">
                <span
                  className={`inline-flex px-2 py-0.5 rounded text-xs font-medium capitalize ${
                    STATUS_COLORS[room.status] ?? "bg-gray-800 text-gray-400"
                  }`}
                >
                  {room.status}
                </span>
              </td>
              <td className="py-3 px-4 text-gray-400">
                {room.agent_count ?? "—"}
              </td>
              <td className="py-3 px-4 text-gray-400">
                {room.message_count ?? "—"}
              </td>
              <td className="py-3 px-4 text-right">
                <div className="flex items-center justify-end gap-2">
                  <a
                    href={`/admin/rooms/${room.id}`}
                    className="px-3 py-1 text-xs bg-gray-800 hover:bg-gray-700 text-gray-300 rounded transition-colors"
                  >
                    View
                  </a>
                  <a
                    href={`/admin/rooms?edit=${room.id}`}
                    className="px-3 py-1 text-xs bg-gray-800 hover:bg-gray-700 text-gray-300 rounded transition-colors"
                  >
                    Edit
                  </a>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
