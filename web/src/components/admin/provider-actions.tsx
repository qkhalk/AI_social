"use client";

import { useState } from "react";

/**
 * Actions bar shown inside a provider card: batch test and add key for this provider.
 */
interface ProviderActionsProps {
  providerId: string;
  providerName: string;
  credentialIds: string[];
  onRefresh: () => void;
  onAddKey: (providerId: string) => void;
}

export function ProviderActions({ providerId, providerName, credentialIds, onRefresh, onAddKey }: ProviderActionsProps) {
  const [batchTesting, setBatchTesting] = useState(false);
  const [lastResult, setLastResult] = useState<string | null>(null);

  async function handleBatchTest() {
    if (credentialIds.length === 0) {
      setLastResult("No credentials to test.");
      return;
    }
    setBatchTesting(true);
    setLastResult(null);
    try {
      const res = await fetch("/api/admin/credentials/batch-test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ credential_ids: credentialIds }),
      });
      if (!res.ok) {
        const data = await res.json();
        setLastResult(data.error || "Batch test failed.");
        return;
      }
      const data = await res.json();
      const results = data.results || [];
      const passed = results.filter((r: { test_status: string }) => r.test_status === "success").length;
      setLastResult(`${passed}/${results.length} passed`);
      onRefresh();
    } catch {
      setLastResult("Network error.");
    } finally {
      setBatchTesting(false);
      setTimeout(() => setLastResult(null), 4000);
    }
  }

  return (
    <div className="px-4 py-3 bg-gray-950/40 border-t border-gray-800/50 flex items-center justify-between">
      <div className="text-xs text-gray-500">
        {credentialIds.length === 0
          ? "No credentials yet"
          : `${credentialIds.length} credential${credentialIds.length === 1 ? "" : "s"}`}
      </div>
      <div className="flex items-center gap-2">
        {lastResult && <span className="text-xs text-gray-400">{lastResult}</span>}
        <button
          onClick={handleBatchTest}
          disabled={batchTesting || credentialIds.length === 0}
          className="px-3 py-1.5 text-xs text-gray-300 bg-gray-800 hover:bg-gray-700 disabled:bg-gray-900 disabled:text-gray-600 border border-gray-700 rounded transition-colors"
        >
          {batchTesting ? "Testing..." : "Batch Test"}
        </button>
        <button
          onClick={() => onAddKey(providerId)}
          className="px-3 py-1.5 text-xs text-white bg-blue-600 hover:bg-blue-700 rounded transition-colors"
        >
          + Add Key
        </button>
      </div>
    </div>
  );
}
