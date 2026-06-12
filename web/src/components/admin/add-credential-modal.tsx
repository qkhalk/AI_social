"use client";

import { useState } from "react";

/**
 * Slide-over modal for adding a new model credential.
 * Form is submitted via button click (not a wrapping <form>) to avoid
 * nested form issues inside the page layout.
 */

export interface ProviderOption {
  id: string;
  name: string;
  display_name: string;
}

interface AddCredentialModalProps {
  open: boolean;
  onClose: () => void;
  providers: ProviderOption[];
  initialProviderId?: string;
  onCreated: () => void;
}

const INPUT_CLS =
  "w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded text-white placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent";

export function AddCredentialModal({ open, onClose, providers, initialProviderId, onCreated }: AddCredentialModalProps) {
  const [providerId, setProviderId] = useState(initialProviderId || providers[0]?.id || "");
  const [credentialName, setCredentialName] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [isDefault, setIsDefault] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const selectedProvider = providers.find((p) => p.id === providerId);
  const needsBaseUrl = selectedProvider?.name === "custom";

  if (!open) return null;

  async function submit() {
    setError("");
    if (!apiKey.trim()) {
      setError("API key is required.");
      return;
    }
    if (needsBaseUrl && !baseUrl.trim()) {
      setError("Base URL is required for custom providers.");
      return;
    }

    setLoading(true);
    try {
      const config: Record<string, string> = { api_key: apiKey.trim() };
      if (baseUrl.trim()) config.base_url = baseUrl.trim();

      const res = await fetch("/api/admin/credentials", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider_id: providerId,
          credential_name: credentialName.trim() || `${selectedProvider?.display_name} Key`,
          config,
          is_default: isDefault,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "Failed to add credential.");
        return;
      }

      setApiKey("");
      setBaseUrl("");
      setCredentialName("");
      setIsDefault(false);
      onCreated();
      onClose();
    } catch {
      setError("Network error.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <div
        onClick={onClose}
        className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40 transition-opacity"
      />
      <div className="fixed inset-y-0 right-0 w-full max-w-md bg-gray-900 border-l border-gray-800 z-50 flex flex-col shadow-2xl">
        <div className="px-5 py-4 border-b border-gray-800 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-white">Add Credential</h2>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-white text-xl leading-none w-8 h-8 flex items-center justify-center rounded hover:bg-gray-800 transition-colors"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {error && (
            <div className="p-3 bg-red-900/50 border border-red-700 rounded text-red-300 text-sm">
              {error}
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1.5">Provider *</label>
            <select
              value={providerId}
              onChange={(e) => setProviderId(e.target.value)}
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
            <label className="block text-sm font-medium text-gray-300 mb-1.5">Credential Name</label>
            <input
              value={credentialName}
              onChange={(e) => setCredentialName(e.target.value)}
              placeholder={selectedProvider ? `${selectedProvider.display_name} Key` : "My API Key"}
              className={INPUT_CLS}
            />
            <p className="text-[11px] text-gray-500 mt-1">Optional — defaults to provider name</p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1.5">API Key *</label>
            <input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="sk-..."
              className={INPUT_CLS}
              required
              autoComplete="off"
            />
            <p className="text-[11px] text-gray-500 mt-1">
              Encrypted with AES-256-GCM before storage. Never displayed again.
            </p>
          </div>

          {needsBaseUrl && (
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1.5">Custom Base URL *</label>
              <input
                value={baseUrl}
                onChange={(e) => setBaseUrl(e.target.value)}
                placeholder="https://api.example.com/v1"
                className={INPUT_CLS}
                required={needsBaseUrl}
              />
              <p className="text-[11px] text-gray-500 mt-1">Must use HTTPS and not target a private host</p>
            </div>
          )}

          <div className="flex items-center gap-2 pt-1">
            <input
              type="checkbox"
              id="is_default"
              checked={isDefault}
              onChange={(e) => setIsDefault(e.target.checked)}
              className="w-4 h-4 accent-blue-500"
            />
            <label htmlFor="is_default" className="text-sm text-gray-300 cursor-pointer">
              Set as default for this provider
            </label>
          </div>
        </div>

        <div className="px-5 py-3 border-t border-gray-800 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm text-gray-300 bg-gray-800 hover:bg-gray-700 rounded transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={loading || !apiKey.trim()}
            className="px-4 py-2 text-sm text-white bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 rounded transition-colors"
          >
            {loading ? "Saving..." : "Add Credential"}
          </button>
        </div>
      </div>
    </>
  );
}
