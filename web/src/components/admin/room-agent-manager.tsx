"use client";

import { useState } from "react";

interface AgentOption {
  id: string;
  name: string;
}

interface RoomAgentManagerProps {
  roomId: string;
  availableAgents: AgentOption[];
}

/**
 * Mini component for adding/removing agents from a room.
 * Shown in the room detail sidebar.
 */
export function RoomAgentManager({ roomId, availableAgents }: RoomAgentManagerProps) {
  const [selectedId, setSelectedId] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  if (availableAgents.length === 0) {
    return <p className="text-xs text-gray-500">No more agents available to add.</p>;
  }

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedId) return;

    setLoading(true);
    setError("");
    setSuccess("");

    try {
      const res = await fetch(`/api/admin/rooms/${roomId}/agents`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agent_id: selectedId }),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "Failed to add agent.");
        return;
      }

      setSuccess("Agent added. Refresh to see changes.");
      setSelectedId("");
    } catch {
      setError("Network error.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      {error && (
        <p className="text-xs text-red-400 mb-2">{error}</p>
      )}
      {success && (
        <p className="text-xs text-green-400 mb-2">{success}</p>
      )}
      <form onSubmit={handleAdd} className="flex gap-2">
        <select
          value={selectedId}
          onChange={(e) => setSelectedId(e.target.value)}
          className="flex-1 px-2 py-1.5 bg-gray-800 border border-gray-700 rounded text-xs text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="">Select agent...</option>
          {availableAgents.map((a) => (
            <option key={a.id} value={a.id}>{a.name}</option>
          ))}
        </select>
        <button
          type="submit"
          disabled={loading || !selectedId}
          className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 text-white text-xs rounded transition-colors"
        >
          {loading ? "..." : "Add"}
        </button>
      </form>
    </div>
  );
}
