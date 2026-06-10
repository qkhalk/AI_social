"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/**
 * Form for adding a new model credential.
 * API key is sent to the server which encrypts it before storing.
 * Never displays or returns decrypted keys.
 */

export interface ProviderOption {
  id: string;
  name: string;
  display_name: string;
}

interface CredentialFormProps {
  providers: ProviderOption[];
}

const INPUT_CLS =
  "w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded text-white placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500";

export function CredentialForm({ providers }: CredentialFormProps) {
  const router = useRouter();
  const [form, setForm] = useState({
    provider_id: providers[0]?.id || "",
    credential_name: "",
    api_key: "",
    base_url: "",
    is_default: false,
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Check if selected provider is "custom" which needs a base_url
  const selectedProvider = providers.find((p) => p.id === form.provider_id);
  const needsBaseUrl = selectedProvider?.name === "custom";

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    if (!form.api_key.trim()) {
      setError("API key is required.");
      return;
    }

    setLoading(true);
    try {
      const config: Record<string, string> = { api_key: form.api_key.trim() };
      if (form.base_url.trim()) config.base_url = form.base_url.trim();

      const res = await fetch("/api/admin/credentials", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider_id: form.provider_id,
          credential_name: form.credential_name.trim() || `${selectedProvider?.display_name} Key`,
          config,
          is_default: form.is_default,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "Failed to add credential.");
        return;
      }

      router.push("/admin/models?tab=credentials");
      router.refresh();
    } catch {
      setError("Network error.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5 max-w-lg">
      {error && (
        <div className="p-3 bg-red-900/50 border border-red-700 rounded text-red-300 text-sm">
          {error}
        </div>
      )}

      <div>
        <label className="block text-sm font-medium text-gray-300 mb-1">Provider *</label>
        <select
          value={form.provider_id}
          onChange={(e) => setForm((f) => ({ ...f, provider_id: e.target.value }))}
          className={INPUT_CLS}
          required
        >
          {providers.map((p) => (
            <option key={p.id} value={p.id}>
              {p.display_name}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-300 mb-1">Credential Name</label>
        <input
          value={form.credential_name}
          onChange={(e) => setForm((f) => ({ ...f, credential_name: e.target.value }))}
          placeholder={selectedProvider ? `${selectedProvider.display_name} Key` : "My API Key"}
          className={INPUT_CLS}
        />
        <p className="text-xs text-gray-500 mt-1">
          Optional — defaults to provider name if left empty
        </p>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-300 mb-1">API Key *</label>
        <input
          type="password"
          value={form.api_key}
          onChange={(e) => setForm((f) => ({ ...f, api_key: e.target.value }))}
          placeholder="sk-..."
          className={INPUT_CLS}
          required
        />
        <p className="text-xs text-gray-500 mt-1">
          Encrypted with AES-256-GCM before storage. Never displayed again.
        </p>
      </div>

      {needsBaseUrl && (
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-1">Custom Base URL *</label>
          <input
            value={form.base_url}
            onChange={(e) => setForm((f) => ({ ...f, base_url: e.target.value }))}
            placeholder="https://api.example.com/v1"
            className={INPUT_CLS}
            required={needsBaseUrl}
          />
        </div>
      )}

      <div className="flex items-center gap-2">
        <input
          type="checkbox"
          id="is_default"
          checked={form.is_default}
          onChange={(e) => setForm((f) => ({ ...f, is_default: e.target.checked }))}
          className="w-4 h-4 accent-blue-500"
        />
        <label htmlFor="is_default" className="text-sm text-gray-300 cursor-pointer">
          Set as default for this provider
        </label>
      </div>

      <div className="flex gap-3 pt-2">
        <button
          type="submit"
          disabled={loading || !form.api_key.trim()}
          className="px-6 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 text-white font-medium rounded-lg transition-colors"
        >
          {loading ? "Saving..." : "Add Credential"}
        </button>
        <button
          type="button"
          onClick={() => router.push("/admin/models?tab=credentials")}
          className="px-6 py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-lg transition-colors"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
