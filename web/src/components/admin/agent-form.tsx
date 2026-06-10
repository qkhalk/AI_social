"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { MODEL_OPTIONS, WRITING_STYLES, DEFAULT_AGENT_DATA } from "@/lib/admin/agent-constants";
import { PersonalitySliders } from "./personality-sliders";
import { TagInput } from "./tag-input";

export interface AgentFormData {
  name: string;
  avatar_url: string;
  system_prompt: string;
  model_name: string;
  personality_traits: Record<string, number>;
  expertise_keywords: string[];
  writing_style: string;
  is_active: boolean;
  response_temperature: number;
  max_context_messages: number;
}

interface AgentFormProps {
  initialData?: AgentFormData & { id: string };
}

const INPUT_CLS = "w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded text-white placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500";

export function AgentForm({ initialData }: AgentFormProps) {
  const router = useRouter();
  const isEdit = !!initialData;
  const [form, setForm] = useState<AgentFormData>(initialData ?? { ...DEFAULT_AGENT_DATA });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => { if (initialData) setForm(initialData); }, [initialData]);

  function updateField<K extends keyof AgentFormData>(key: K, val: AgentFormData[K]) {
    setForm((prev) => ({ ...prev, [key]: val }));
  }
  function updateTrait(trait: string, value: number) {
    setForm((prev) => ({ ...prev, personality_traits: { ...prev.personality_traits, [trait]: value } }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const url = isEdit ? `/api/admin/agents/${initialData!.id}` : "/api/admin/agents";
      const method = isEdit ? "PATCH" : "POST";
      const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
      if (!res.ok) { setError((await res.json()).error || "Operation failed."); return; }
      router.push("/admin/agents");
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
        <label className="block text-sm font-medium text-gray-300 mb-1">Name *</label>
        <input required value={form.name} onChange={(e) => updateField("name", e.target.value)} className={INPUT_CLS} />
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-300 mb-1">Avatar URL</label>
        <input value={form.avatar_url} onChange={(e) => updateField("avatar_url", e.target.value)}
          placeholder="https://example.com/avatar.png" className={INPUT_CLS} />
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-300 mb-1">System Prompt *</label>
        <textarea required rows={4} value={form.system_prompt}
          onChange={(e) => updateField("system_prompt", e.target.value)} className={INPUT_CLS} />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-1">Model</label>
          <select value={form.model_name} onChange={(e) => updateField("model_name", e.target.value)} className={INPUT_CLS}>
            {MODEL_OPTIONS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-1">Writing Style</label>
          <select value={form.writing_style} onChange={(e) => updateField("writing_style", e.target.value)} className={INPUT_CLS}>
            {WRITING_STYLES.map((s) => <option key={s} value={s}>{s[0].toUpperCase() + s.slice(1)}</option>)}
          </select>
        </div>
      </div>
      <PersonalitySliders traits={form.personality_traits} onChange={updateTrait} />
      <TagInput tags={form.expertise_keywords} onChange={(tags) => updateField("expertise_keywords", tags)} label="Expertise Keywords" />
      <div className="grid grid-cols-3 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-1">Temperature</label>
          <input type="number" min={0} max={2} step={0.1} value={form.response_temperature}
            onChange={(e) => updateField("response_temperature", parseFloat(e.target.value))} className={INPUT_CLS} />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-1">Max Context Msgs</label>
          <input type="number" min={1} max={100} value={form.max_context_messages}
            onChange={(e) => updateField("max_context_messages", parseInt(e.target.value))} className={INPUT_CLS} />
        </div>
        <div className="flex items-end pb-1">
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={form.is_active} onChange={(e) => updateField("is_active", e.target.checked)} className="w-4 h-4 accent-blue-500" />
            <span className="text-sm text-gray-300">Active</span>
          </label>
        </div>
      </div>
      <div className="flex gap-3">
        <button type="submit" disabled={loading}
          className="px-6 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 text-white font-medium rounded-lg transition-colors">
          {loading ? "Saving..." : isEdit ? "Update Agent" : "Create Agent"}
        </button>
        <button type="button" onClick={() => router.push("/admin/agents")}
          className="px-6 py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-lg transition-colors">
          Cancel
        </button>
      </div>
    </form>
  );
}
