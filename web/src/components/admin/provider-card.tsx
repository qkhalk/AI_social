"use client";

import { useState } from "react";
import { CredentialRow, CredentialRowProps } from "./credential-row";
import { ProviderActions } from "./provider-actions";
import { CredentialTestStatus } from "./credential-test-badge";

/**
 * Provider card: groups credentials under a single provider.
 * Shows provider name, credential count, health summary, and credential rows.
 */

export interface CredentialData extends Omit<CredentialRowProps, "onRefresh" | "onMoveUp" | "onMoveDown" | "canMoveUp" | "canMoveDown"> {}

export interface ProviderData {
  id: string;
  name: string;
  display_name: string;
  auth_type: string;
  api_base_url: string | null;
  is_active: boolean;
  credentials: CredentialData[];
}

interface ProviderCardProps {
  provider: ProviderData;
  onRefresh: () => void;
  onAddKey: (providerId: string) => void;
  onReorder: (providerId: string, ordering: Array<{ id: string; priority: number }>) => void;
}

export function ProviderCard({ provider, onRefresh, onAddKey, onReorder }: ProviderCardProps) {
  const [expanded, setExpanded] = useState(true);

  // Sort credentials by priority asc, then is_default desc, then created_at
  const sortedCreds = [...provider.credentials].sort((a, b) => {
    if (a.priority !== b.priority) return a.priority - b.priority;
    if (a.is_default !== b.is_default) return a.is_default ? -1 : 1;
    return a.id.localeCompare(b.id);
  });

  const passedCount = sortedCreds.filter((c) => c.test_status === "success").length;
  const failedCount = sortedCreds.filter((c) => c.test_status === "failed").length;
  const untestedCount = sortedCreds.filter((c) => c.test_status === "untested" || c.test_status === null).length;
  const activeCount = sortedCreds.filter((c) => c.is_active).length;

  function moveCredential(index: number, direction: "up" | "down") {
    const target = direction === "up" ? index - 1 : index + 1;
    if (target < 0 || target >= sortedCreds.length) return;
    const next = [...sortedCreds];
    const [moved] = next.splice(index, 1);
    next.splice(target, 0, moved);
    // Reassign priorities (10-step increments to allow future inserts)
    const ordering = next.map((c, i) => ({ id: c.id, priority: (i + 1) * 10 }));
    onReorder(provider.id, ordering);
  }

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-lg overflow-hidden">
      <button
        onClick={() => setExpanded((e) => !e)}
        className="w-full px-4 py-3 flex items-center justify-between hover:bg-gray-800/30 transition-colors"
      >
        <div className="flex items-center gap-3">
          <span className="text-gray-500 text-xs">{expanded ? "▼" : "▶"}</span>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-white font-semibold">{provider.display_name}</h3>
              <span className="text-[10px] text-gray-500 font-mono uppercase">{provider.auth_type}</span>
              {!provider.is_active && (
                <span className="px-1.5 py-0.5 text-[10px] bg-gray-800 text-gray-500 rounded">PROVIDER OFF</span>
              )}
            </div>
            {provider.api_base_url && (
              <div className="text-[11px] text-gray-500 font-mono mt-0.5">{provider.api_base_url}</div>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {sortedCreds.length > 0 && (
            <>
              {activeCount > 0 && (
                <span className="px-2 py-0.5 text-[10px] bg-green-900/40 text-green-400 border border-green-900/60 rounded">
                  {activeCount} active
                </span>
              )}
              {failedCount > 0 && (
                <span className="px-2 py-0.5 text-[10px] bg-red-900/40 text-red-300 border border-red-900/60 rounded">
                  {failedCount} failing
                </span>
              )}
              {untestedCount > 0 && (
                <span className="px-2 py-0.5 text-[10px] bg-gray-800 text-gray-400 border border-gray-700 rounded">
                  {untestedCount} untested
                </span>
              )}
            </>
          )}
          <span className="text-xs text-gray-500 ml-2">{sortedCreds.length}</span>
        </div>
      </button>

      {expanded && (
        <>
          {sortedCreds.length > 0 ? (
            <div className="border-t border-gray-800">
              <div className="grid grid-cols-12 gap-3 px-4 py-2 text-[11px] text-gray-500 uppercase tracking-wider border-b border-gray-800/50">
                <div className="col-span-1">Pri</div>
                <div className="col-span-3">Name</div>
                <div className="col-span-2">Default</div>
                <div className="col-span-2">Test</div>
                <div className="col-span-2">Lock</div>
                <div className="col-span-2 text-right">Actions</div>
              </div>
              {sortedCreds.map((cred, idx) => (
                <CredentialRow
                  key={cred.id}
                  credential={cred}
                  onRefresh={onRefresh}
                  onMoveUp={() => moveCredential(idx, "up")}
                  onMoveDown={() => moveCredential(idx, "down")}
                  canMoveUp={idx > 0}
                  canMoveDown={idx < sortedCreds.length - 1}
                />
              ))}
            </div>
          ) : (
            <div className="border-t border-gray-800 px-4 py-6 text-center text-sm text-gray-500">
              No credentials yet for this provider.
            </div>
          )}
          <ProviderActions
            providerId={provider.id}
            providerName={provider.display_name}
            credentialIds={sortedCreds.map((c) => c.id)}
            onRefresh={onRefresh}
            onAddKey={onAddKey}
          />
        </>
      )}
    </div>
  );
}
