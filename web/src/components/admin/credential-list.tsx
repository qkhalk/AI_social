"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CredentialTestBadge, CredentialTestStatus } from "./credential-test-badge";

/**
 * Credential list with delete and toggle-default actions.
 * API keys are never displayed — only metadata is shown.
 */

export interface CredentialRow {
  id: string;
  credential_name: string;
  provider_id: string;
  is_default: boolean;
  is_active: boolean;
  test_status: CredentialTestStatus;
  last_tested_at: string | null;
  last_test_error: string | null;
  created_at: string;
  model_providers: { name: string; display_name: string }[] | null;
}

interface CredentialListProps {
  credentials: CredentialRow[];
}

export function CredentialList({ credentials }: CredentialListProps) {
  const router = useRouter();
  const [deleting, setDeleting] = useState<string | null>(null);
  const [testing, setTesting] = useState<string | null>(null);

  if (credentials.length === 0) {
    return (
      <div className="text-center py-8">
        <p className="text-gray-500 mb-3">No credentials added yet.</p>
        <a
          href="/admin/models?tab=credentials&new-cred=1"
          className="text-blue-400 hover:text-blue-300 text-sm"
        >
          + Add your first credential
        </a>
      </div>
    );
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this credential? Agents using it will lose model access.")) return;
    setDeleting(id);
    try {
      const res = await fetch(`/api/admin/credentials/${id}`, { method: "DELETE" });
      if (!res.ok) {
        alert((await res.json()).error || "Delete failed.");
        return;
      }
      router.refresh();
    } catch {
      alert("Network error.");
    } finally {
      setDeleting(null);
    }
  }

  async function handleToggleDefault(id: string, currentDefault: boolean) {
    try {
      const res = await fetch(`/api/admin/credentials/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_default: !currentDefault }),
      });
      if (!res.ok) {
        alert((await res.json()).error || "Update failed.");
        return;
      }
      router.refresh();
    } catch {
      alert("Network error.");
    }
  }

  async function handleTest(id: string) {
    setTesting(id);
    try {
      const res = await fetch(`/api/admin/credentials/${id}/test`, { method: "POST" });
      if (!res.ok) {
        const data = await res.json();
        if (data.error) alert(data.error);
      }
      router.refresh();
    } catch {
      alert("Network error.");
    } finally {
      setTesting(null);
    }
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-800">
            <th className="text-left py-3 px-3 text-gray-400 font-medium">Name</th>
            <th className="text-left py-3 px-3 text-gray-400 font-medium">Provider</th>
            <th className="text-left py-3 px-3 text-gray-400 font-medium">Default</th>
            <th className="text-left py-3 px-3 text-gray-400 font-medium">Status</th>
            <th className="text-left py-3 px-3 text-gray-400 font-medium">Test</th>
            <th className="text-left py-3 px-3 text-gray-400 font-medium">Actions</th>
          </tr>
        </thead>
        <tbody>
          {credentials.map((c) => (
            <tr key={c.id} className="border-b border-gray-800/50 hover:bg-gray-800/30">
              <td className="py-3 px-3 text-white font-medium">{c.credential_name}</td>
              <td className="py-3 px-3 text-gray-400">
                {c.model_providers?.[0]?.display_name ?? "Unknown"}
              </td>
              <td className="py-3 px-3">
                <button
                  onClick={() => handleToggleDefault(c.id, c.is_default)}
                  className={`px-2 py-0.5 rounded text-xs font-medium transition-colors ${
                    c.is_default
                      ? "bg-blue-900/50 text-blue-400 cursor-pointer hover:bg-blue-900/70"
                      : "bg-gray-800 text-gray-500 cursor-pointer hover:bg-gray-700"
                  }`}
                >
                  {c.is_default ? "Default" : "Set Default"}
                </button>
              </td>
              <td className="py-3 px-3">
                <span className={`px-2 py-0.5 rounded text-xs font-medium ${c.is_active ? "bg-green-900/50 text-green-400" : "bg-gray-800 text-gray-500"}`}>
                  {c.is_active ? "Active" : "Inactive"}
                </span>
              </td>
              <td className="py-3 px-3">
                <div className="flex flex-col gap-1">
                  <CredentialTestBadge status={testing === c.id ? "testing" : c.test_status} error={c.last_test_error} />
                  {c.last_tested_at && (
                    <span className="text-[11px] text-gray-500">
                      {new Date(c.last_tested_at).toLocaleString()}
                    </span>
                  )}
                </div>
              </td>
              <td className="py-3 px-3">
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => handleTest(c.id)}
                    disabled={testing === c.id || deleting === c.id}
                    className="text-blue-400 hover:text-blue-300 disabled:text-gray-600 text-xs transition-colors"
                  >
                    {testing === c.id ? "Testing..." : "Test"}
                  </button>
                <button
                  onClick={() => handleDelete(c.id)}
                  disabled={deleting === c.id}
                  className="text-red-400 hover:text-red-300 disabled:text-gray-600 text-xs transition-colors"
                >
                  {deleting === c.id ? "Deleting..." : "Delete"}
                </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
