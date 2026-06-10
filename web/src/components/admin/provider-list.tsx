"use client";

/**
 * Read-only provider list showing configured model providers.
 * Providers are seeded via migration; toggling active state is the main admin action.
 */

export interface ProviderRow {
  id: string;
  name: string;
  display_name: string;
  auth_type: string;
  api_base_url: string | null;
  is_active: boolean;
}

interface ProviderListProps {
  providers: ProviderRow[];
}

export function ProviderList({ providers }: ProviderListProps) {
  if (providers.length === 0) {
    return <p className="text-gray-500 text-sm">No providers configured.</p>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-800">
            <th className="text-left py-3 px-3 text-gray-400 font-medium">Provider</th>
            <th className="text-left py-3 px-3 text-gray-400 font-medium">Auth Type</th>
            <th className="text-left py-3 px-3 text-gray-400 font-medium">API Base URL</th>
            <th className="text-left py-3 px-3 text-gray-400 font-medium">Status</th>
          </tr>
        </thead>
        <tbody>
          {providers.map((p) => (
            <tr key={p.id} className="border-b border-gray-800/50 hover:bg-gray-800/30">
              <td className="py-3 px-3 text-white font-medium">{p.display_name}</td>
              <td className="py-3 px-3 text-gray-400">
                <span className="px-2 py-0.5 bg-gray-800 rounded text-xs">{p.auth_type}</span>
              </td>
              <td className="py-3 px-3 text-gray-400 font-mono text-xs">
                {p.api_base_url || "—"}
              </td>
              <td className="py-3 px-3">
                <span
                  className={`px-2 py-0.5 rounded text-xs font-medium ${
                    p.is_active
                      ? "bg-green-900/50 text-green-400"
                      : "bg-gray-800 text-gray-500"
                  }`}
                >
                  {p.is_active ? "Active" : "Inactive"}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
