"use client";

import { useState, useMemo } from "react";
import { ProviderCard, ProviderData } from "./provider-card";
import { AddCredentialModal, ProviderOption } from "./add-credential-modal";

/**
 * Main client component for the Models page.
 * Groups credentials under providers, manages modal state, and triggers refresh.
 */

interface ModelsPageClientProps {
  providers: ProviderOption[];
  initialProviderData: ProviderData[];
}

export function ModelsPageClient({ providers, initialProviderData }: ModelsPageClientProps) {
  const [data, setData] = useState<ProviderData[]>(initialProviderData);
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [activeProviderId, setActiveProviderId] = useState<string | undefined>(undefined);
  const [searchQuery, setSearchQuery] = useState("");

  const filteredData = useMemo(() => {
    if (!searchQuery.trim()) return data;
    const q = searchQuery.toLowerCase();
    return data
      .map((p) => ({
        ...p,
        credentials: p.credentials.filter((c) =>
          c.credential_name.toLowerCase().includes(q)
        ),
      }))
      .filter((p) => p.display_name.toLowerCase().includes(q) || p.credentials.length > 0);
  }, [data, searchQuery]);

  const totalCredentials = data.reduce((sum, p) => sum + p.credentials.length, 0);
  const totalActive = data.reduce(
    (sum, p) => sum + p.credentials.filter((c) => c.is_active).length,
    0
  );

  function handleRefresh() {
    // Trigger server re-render via location reload (simple, reliable).
    window.location.reload();
  }

  function handleAddKey(providerId?: string) {
    setActiveProviderId(providerId);
    setAddModalOpen(true);
  }

  async function handleReorder(providerId: string, ordering: Array<{ id: string; priority: number }>) {
    try {
      const res = await fetch("/api/admin/credentials/reorder", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider_id: providerId, ordering }),
      });
      if (!res.ok) {
        const data = await res.json();
        alert(data.error || "Reorder failed.");
        return;
      }
      handleRefresh();
    } catch {
      alert("Network error.");
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6 gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Models & Credentials</h1>
          <p className="text-sm text-gray-500 mt-1">
            {totalActive} active credentials across {data.length} provider{data.length === 1 ? "" : "s"}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <input
            type="text"
            placeholder="Search credentials..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="px-3 py-2 bg-gray-900 border border-gray-800 rounded text-sm text-white placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500 w-64"
          />
          <button
            onClick={() => handleAddKey()}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors whitespace-nowrap"
          >
            + Add Key
          </button>
        </div>
      </div>

      {filteredData.length === 0 ? (
        <div className="bg-gray-900 border border-gray-800 rounded-lg p-12 text-center">
          <p className="text-gray-500 mb-3">
            {searchQuery ? "No credentials match your search." : "No credentials configured yet."}
          </p>
          {!searchQuery && (
            <button
              onClick={() => handleAddKey()}
              className="text-blue-400 hover:text-blue-300 text-sm"
            >
              + Add your first credential
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {filteredData.map((provider) => (
            <ProviderCard
              key={provider.id}
              provider={provider}
              onRefresh={handleRefresh}
              onAddKey={handleAddKey}
              onReorder={handleReorder}
            />
          ))}
        </div>
      )}

      <AddCredentialModal
        open={addModalOpen}
        onClose={() => setAddModalOpen(false)}
        providers={providers}
        initialProviderId={activeProviderId}
        onCreated={handleRefresh}
      />
    </div>
  );
}
