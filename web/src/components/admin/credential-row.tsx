"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CredentialTestBadge, CredentialTestStatus } from "./credential-test-badge";
import { CredentialLockBadge } from "./credential-lock-badge";

/**
 * Single credential row in a provider card.
 * Shows priority, name, test status, lock status, and actions (test, move, delete, toggle default).
 */

export interface CredentialRowProps {
  id: string;
  credential_name: string;
  provider_id: string;
  priority: number;
  is_default: boolean;
  is_active: boolean;
  test_status: CredentialTestStatus;
  last_tested_at: string | null;
  last_test_error: string | null;
  backoff_level?: number;
  health?: CredentialHealthData | null;
  onRefresh?: () => void;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
  canMoveUp?: boolean;
  canMoveDown?: boolean;
}

export interface CredentialHealthData {
  priority?: number;
  backoff_level?: number;
  last_used_at?: string | null;
  active_locks: Array<{ model_name: string; locked_until: string; error_type: string }>;
}

interface CredentialRowComponentProps {
  credential: CredentialRowProps;
  onRefresh: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  canMoveUp: boolean;
  canMoveDown: boolean;
}

export function CredentialRow({
  credential,
  onRefresh,
  onMoveUp,
  onMoveDown,
  canMoveUp,
  canMoveDown,
}: CredentialRowComponentProps) {
  const router = useRouter();
  const [deleting, setDeleting] = useState(false);
  const [testing, setTesting] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [health, setHealth] = useState<CredentialHealthData | null>(credential.health || null);

  async function handleDelete() {
    if (!confirm("Delete this credential? Agents using it will lose model access.")) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/admin/credentials/${credential.id}`, { method: "DELETE" });
      if (!res.ok) {
        alert((await res.json()).error || "Delete failed.");
        return;
      }
      onRefresh();
    } catch {
      alert("Network error.");
    } finally {
      setDeleting(false);
    }
  }

  async function handleToggleDefault() {
    try {
      const res = await fetch(`/api/admin/credentials/${credential.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_default: !credential.is_default }),
      });
      if (!res.ok) {
        alert((await res.json()).error || "Update failed.");
        return;
      }
      onRefresh();
    } catch {
      alert("Network error.");
    }
  }

  async function handleToggleActive() {
    try {
      const res = await fetch(`/api/admin/credentials/${credential.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_active: !credential.is_active }),
      });
      if (!res.ok) {
        alert((await res.json()).error || "Update failed.");
        return;
      }
      onRefresh();
    } catch {
      alert("Network error.");
    }
  }

  async function handleTest() {
    setTesting(true);
    try {
      const res = await fetch(`/api/admin/credentials/${credential.id}/test`, { method: "POST" });
      if (!res.ok) {
        const data = await res.json();
        if (data.error) alert(data.error);
      }
      onRefresh();
    } catch {
      alert("Network error.");
    } finally {
      setTesting(false);
    }
  }

  async function loadHealth() {
    if (health) {
      setHealth(null);
      return;
    }
    try {
      const res = await fetch(`/api/admin/credentials/${credential.id}/health`);
      if (res.ok) {
        const data = await res.json();
        setHealth({
          priority: data.priority,
          backoff_level: data.backoff_level,
          last_used_at: data.last_used_at,
          active_locks: data.active_locks || [],
        });
      }
    } catch {
      // ignore
    }
  }

  const activeLock = health?.active_locks?.[0];

  return (
    <div className="border-b border-gray-800/50 last:border-b-0">
      <div className="grid grid-cols-12 gap-3 items-center px-4 py-3 hover:bg-gray-800/20 transition-colors">
        <div className="col-span-1 flex items-center gap-1">
          <div className="flex flex-col gap-0.5">
            <button
              onClick={onMoveUp}
              disabled={!canMoveUp}
              className="text-gray-500 hover:text-white disabled:opacity-20 disabled:cursor-not-allowed text-[10px] leading-none"
              aria-label="Move up"
            >
              ▲
            </button>
            <button
              onClick={onMoveDown}
              disabled={!canMoveDown}
              className="text-gray-500 hover:text-white disabled:opacity-20 disabled:cursor-not-allowed text-[10px] leading-none"
              aria-label="Move down"
            >
              ▼
            </button>
          </div>
          <span className="text-xs text-gray-500 font-mono">#{credential.priority}</span>
        </div>

        <div className="col-span-3">
          <div className="text-white font-medium text-sm">{credential.credential_name}</div>
          {credential.last_tested_at && (
            <div className="text-[11px] text-gray-500">
              Tested {new Date(credential.last_tested_at).toLocaleDateString()}
            </div>
          )}
        </div>

        <div className="col-span-2">
          <button
            onClick={handleToggleDefault}
            className={`px-2 py-0.5 rounded text-xs font-medium transition-colors ${
              credential.is_default
                ? "bg-blue-900/50 text-blue-400 border border-blue-900/70"
                : "bg-gray-800 text-gray-500 border border-gray-700 hover:bg-gray-700"
            }`}
          >
            {credential.is_default ? "★ Default" : "Set Default"}
          </button>
        </div>

        <div className="col-span-2">
          <CredentialTestBadge status={testing ? "testing" : credential.test_status} error={credential.last_test_error} />
        </div>

        <div className="col-span-2">
          <CredentialLockBadge
            lockedUntil={activeLock?.locked_until || null}
            errorType={activeLock?.error_type || null}
            backoffLevel={credential.backoff_level || 0}
          />
        </div>

        <div className="col-span-2 flex items-center justify-end gap-2">
          <button
            onClick={handleTest}
            disabled={testing || deleting}
            className="px-2 py-1 text-xs text-blue-400 hover:bg-blue-900/30 disabled:text-gray-600 rounded transition-colors"
          >
            {testing ? "..." : "Test"}
          </button>
          <button
            onClick={loadHealth}
            className="px-2 py-1 text-xs text-gray-400 hover:bg-gray-800 rounded transition-colors"
            title="View health/lock details"
          >
            {health ? "Hide" : "Info"}
          </button>
          <button
            onClick={handleToggleActive}
            className={`px-2 py-1 text-xs rounded transition-colors ${
              credential.is_active
                ? "text-green-400 hover:bg-green-900/30"
                : "text-gray-500 hover:bg-gray-800"
            }`}
          >
            {credential.is_active ? "●" : "○"}
          </button>
          <button
            onClick={handleDelete}
            disabled={deleting}
            className="px-2 py-1 text-xs text-red-400 hover:bg-red-900/30 disabled:text-gray-600 rounded transition-colors"
          >
            {deleting ? "..." : "✕"}
          </button>
        </div>
      </div>

      {health && (
        <div className="px-4 py-3 bg-gray-950/50 border-t border-gray-800/50">
          <div className="grid grid-cols-3 gap-4 text-xs">
            <div>
              <div className="text-gray-500 mb-1">Backoff Level</div>
              <div className="text-white font-mono">{health.backoff_level ?? 0}</div>
            </div>
            <div>
              <div className="text-gray-500 mb-1">Last Used</div>
              <div className="text-white font-mono">
                {health.last_used_at ? new Date(health.last_used_at).toLocaleString() : "Never"}
              </div>
            </div>
            <div>
              <div className="text-gray-500 mb-1">Active Locks</div>
              <div className="text-white font-mono">{health.active_locks.length}</div>
            </div>
          </div>
          {health.active_locks.length > 0 && (
            <div className="mt-3">
              <div className="text-gray-500 text-xs mb-2">Model Locks</div>
              <div className="space-y-1">
                {health.active_locks.map((lock) => (
                  <div
                    key={lock.model_name}
                    className="flex items-center justify-between text-xs px-2 py-1 bg-red-950/30 border border-red-900/40 rounded"
                  >
                    <span className="text-red-300 font-mono">{lock.model_name}</span>
                    <span className="text-gray-500">
                      {lock.error_type} until {new Date(lock.locked_until).toLocaleTimeString()}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
