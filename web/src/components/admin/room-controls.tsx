"use client";

import { useState } from "react";

interface RoomControlsProps {
  roomId: string;
  currentStatus: string;
}

type StatusAction = "paused" | "active" | "concluded" | "archived";

/**
 * Room lifecycle controls: pause/resume/conclude/archive.
 * Each button only shows when the transition is valid from current status.
 */
export function RoomControls({ roomId, currentStatus }: RoomControlsProps) {
  const [status, setStatus] = useState(currentStatus);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function updateStatus(newStatus: StatusAction) {
    setLoading(true);
    setError("");

    try {
      const res = await fetch(`/api/admin/rooms/${roomId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "Failed to update status.");
        return;
      }

      setStatus(newStatus);
    } catch {
      setError("Network error.");
    } finally {
      setLoading(false);
    }
  }

  // Define which transitions are valid from each status
  const actions: { target: StatusAction; label: string; color: string }[] = [];

  if (status === "active") {
    actions.push({ target: "paused", label: "Pause", color: "bg-yellow-600 hover:bg-yellow-700 text-yellow-100" });
  }
  if (status === "paused" || status === "waiting") {
    actions.push({ target: "active", label: "Resume", color: "bg-green-600 hover:bg-green-700 text-green-100" });
  }
  if (status === "active" || status === "paused") {
    actions.push({ target: "concluded", label: "Conclude", color: "bg-red-600 hover:bg-red-700 text-red-100" });
  }
  if (status === "concluded") {
    actions.push({ target: "archived", label: "Archive", color: "bg-gray-600 hover:bg-gray-500 text-gray-200" });
  }

  if (actions.length === 0) return null;

  return (
    <div>
      {error && (
        <div className="mb-3 p-2 bg-red-900/50 border border-red-700 rounded text-red-300 text-xs">
          {error}
        </div>
      )}
      <div className="flex gap-2">
        {actions.map(({ target, label, color }) => (
          <button
            key={target}
            onClick={() => updateStatus(target)}
            disabled={loading}
            className={`px-4 py-1.5 text-sm font-medium rounded-lg transition-colors disabled:opacity-50 ${color}`}
          >
            {loading ? "..." : label}
          </button>
        ))}
      </div>
    </div>
  );
}
