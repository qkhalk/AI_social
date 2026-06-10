"use client";

import { useState } from "react";
import Link from "next/link";

export interface AgentRow {
  id: string;
  name: string;
  avatar_url: string | null;
  model_name: string;
  is_active: boolean;
  response_temperature: number;
  created_at: string;
}

interface AgentListProps {
  agents: AgentRow[];
}

/**
 * Table of agents with edit/delete actions.
 * Delegates API calls to parent via callbacks.
 */
export function AgentList({ agents }: AgentListProps) {
  const [deleting, setDeleting] = useState<string | null>(null);
  const [error, setError] = useState("");

  async function handleDelete(id: string) {
    if (!confirm("Delete this agent? This cannot be undone.")) return;
    setDeleting(id);
    setError("");

    try {
      const res = await fetch(`/api/admin/agents/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "Delete failed.");
        return;
      }
      window.location.reload();
    } catch {
      setError("Network error.");
    } finally {
      setDeleting(null);
    }
  }

  if (agents.length === 0) {
    return (
      <div className="text-center py-12 text-gray-500">
        <p>No agents yet.</p>
        <Link
          href="/admin/agents"
          className="text-blue-400 hover:text-blue-300 text-sm mt-2 inline-block"
        >
          Create your first agent
        </Link>
      </div>
    );
  }

  return (
    <div>
      {error && (
        <div className="mb-4 p-3 bg-red-900/50 border border-red-700 rounded text-red-300 text-sm">
          {error}
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-800">
              <th className="text-left py-3 px-4 text-gray-400 font-medium">Name</th>
              <th className="text-left py-3 px-4 text-gray-400 font-medium">Model</th>
              <th className="text-left py-3 px-4 text-gray-400 font-medium">Status</th>
              <th className="text-left py-3 px-4 text-gray-400 font-medium">Temp</th>
              <th className="text-right py-3 px-4 text-gray-400 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {agents.map((agent) => (
              <tr
                key={agent.id}
                className="border-b border-gray-800/50 hover:bg-gray-800/50"
              >
                <td className="py-3 px-4">
                  <div className="flex items-center gap-3">
                    {agent.avatar_url ? (
                      <img
                        src={agent.avatar_url}
                        alt={agent.name}
                        className="w-8 h-8 rounded-full object-cover"
                      />
                    ) : (
                      <div className="w-8 h-8 rounded-full bg-gray-700 flex items-center justify-center text-xs text-gray-400">
                        {agent.name[0]?.toUpperCase()}
                      </div>
                    )}
                    <span className="text-gray-200 font-medium">{agent.name}</span>
                  </div>
                </td>
                <td className="py-3 px-4 text-gray-400 font-mono text-xs">
                  {agent.model_name.split("/").pop()}
                </td>
                <td className="py-3 px-4">
                  <span
                    className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${
                      agent.is_active
                        ? "bg-green-900/50 text-green-400"
                        : "bg-gray-800 text-gray-500"
                    }`}
                  >
                    {agent.is_active ? "Active" : "Inactive"}
                  </span>
                </td>
                <td className="py-3 px-4 text-gray-400">{agent.response_temperature}</td>
                <td className="py-3 px-4 text-right">
                  <div className="flex items-center justify-end gap-2">
                    <Link
                      href={`/admin/agents?edit=${agent.id}`}
                      className="px-3 py-1 text-xs bg-gray-800 hover:bg-gray-700 text-gray-300 rounded transition-colors"
                    >
                      Edit
                    </Link>
                    <button
                      onClick={() => handleDelete(agent.id)}
                      disabled={deleting === agent.id}
                      className="px-3 py-1 text-xs bg-red-900/50 hover:bg-red-800 text-red-400 rounded transition-colors disabled:opacity-50"
                    >
                      {deleting === agent.id ? "..." : "Delete"}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
