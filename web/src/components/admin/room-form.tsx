"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { TagInput } from "./tag-input";

interface AgentOption { id: string; name: string; }

export interface RoomFormData {
  name: string;
  description: string;
  topic: string;
  topic_tags: string[];
  max_messages: number;
  agent_ids: string[];
}

interface RoomFormProps {
  initialData?: RoomFormData & { id: string };
  agents: AgentOption[];
}

const DEFAULT_DATA: RoomFormData = {
  name: "", description: "", topic: "", topic_tags: [], max_messages: 50, agent_ids: [],
};

const INPUT_CLS = "w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded text-white placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500";

export function RoomForm({ initialData, agents }: RoomFormProps) {
  const router = useRouter();
  const isEdit = !!initialData;
  const [form, setForm] = useState<RoomFormData>(initialData ?? DEFAULT_DATA);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => { if (initialData) setForm(initialData); }, [initialData]);

  function updateField<K extends keyof RoomFormData>(key: K, val: RoomFormData[K]) {
    setForm((prev) => ({ ...prev, [key]: val }));
  }

  function toggleAgent(agentId: string) {
    setForm((prev) => ({
      ...prev,
      agent_ids: prev.agent_ids.includes(agentId)
        ? prev.agent_ids.filter((id) => id !== agentId)
        : [...prev.agent_ids, agentId],
    }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const url = isEdit ? `/api/admin/rooms/${initialData!.id}` : "/api/admin/rooms";
      const method = isEdit ? "PATCH" : "POST";
      const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
      if (!res.ok) { setError((await res.json()).error || "Operation failed."); return; }
      router.push("/admin/rooms");
      router.refresh();
    } catch { setError("Network error."); }
    finally { setLoading(false); }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6 max-w-2xl">
      {error && (
        <div className="p-3 bg-red-900/50 border border-red-700 rounded text-red-300 text-sm">{error}</div>
      )}
      <div>
        <label className="block text-sm font-medium text-gray-300 mb-1">Room Name *</label>
        <input required value={form.name} onChange={(e) => updateField("name", e.target.value)} className={INPUT_CLS} />
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-300 mb-1">Description</label>
        <textarea rows={3} value={form.description} onChange={(e) => updateField("description", e.target.value)}
          placeholder="What is this room about?" className={INPUT_CLS} />
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-300 mb-1">Topic</label>
        <input value={form.topic} onChange={(e) => updateField("topic", e.target.value)}
          placeholder="e.g. The future of AI ethics" className={INPUT_CLS} />
      </div>
      <TagInput tags={form.topic_tags} onChange={(tags) => updateField("topic_tags", tags)} label="Topic Tags" />
      <div>
        <label className="block text-sm font-medium text-gray-300 mb-1">Max Messages</label>
        <input type="number" min={1} max={1000} value={form.max_messages}
          onChange={(e) => updateField("max_messages", parseInt(e.target.value) || 50)} className={INPUT_CLS} />
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-300 mb-2">
          Select Agents ({form.agent_ids.length} selected)
        </label>
        {agents.length === 0 ? (
          <p className="text-sm text-gray-500">No active agents available. Create agents first.</p>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            {agents.map((agent) => (
              <label key={agent.id}
                className={`flex items-center gap-3 px-3 py-2 rounded-lg border cursor-pointer transition-colors ${
                  form.agent_ids.includes(agent.id)
                    ? "bg-blue-900/30 border-blue-600 text-blue-300"
                    : "bg-gray-800 border-gray-700 text-gray-400 hover:border-gray-600"
                }`}>
                <input type="checkbox" checked={form.agent_ids.includes(agent.id)}
                  onChange={() => toggleAgent(agent.id)} className="w-4 h-4 accent-blue-500" />
                <span className="text-sm">{agent.name}</span>
              </label>
            ))}
          </div>
        )}
      </div>
      <div className="flex gap-3">
        <button type="submit" disabled={loading}
          className="px-6 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 text-white font-medium rounded-lg transition-colors">
          {loading ? "Saving..." : isEdit ? "Update Room" : "Create Room"}
        </button>
        <button type="button" onClick={() => router.push("/admin/rooms")}
          className="px-6 py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-lg transition-colors">
          Cancel
        </button>
      </div>
    </form>
  );
}
