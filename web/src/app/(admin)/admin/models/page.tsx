import { createClient } from "@/lib/supabase/server";
import { ProviderList } from "@/components/admin/provider-list";
import { CredentialList } from "@/components/admin/credential-list";
import { CredentialForm } from "@/components/admin/credential-form";

/**
 * Models management page — two tabs: Providers and Credentials.
 * Providers are seeded via migration; admins manage credentials (encrypted API keys).
 */
export default async function ModelsPage({
  searchParams,
}: {
  searchParams: { tab?: string; "new-cred"?: string; "edit-cred"?: string };
}) {
  const supabase = await createClient();
  const tab = searchParams.tab || "credentials";

  // Fetch providers (for display and credential creation dropdown)
  const { data: providers } = await supabase
    .from("model_providers")
    .select("id, name, display_name, auth_type, api_base_url, is_active")
    .order("display_name", { ascending: true });

  // Fetch credentials (metadata only — encrypted_config excluded)
  const { data: credentials } = await supabase
    .from("model_credentials")
    .select("id, credential_name, provider_id, is_default, is_active, test_status, last_tested_at, last_test_error, created_at, model_providers(name, display_name)")
    .order("created_at", { ascending: false });

  const showCredentialForm = searchParams["new-cred"] === "1" || !!searchParams["edit-cred"];

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-white">Models</h1>
        {tab === "credentials" && !showCredentialForm && (
          <a
            href="/admin/models?tab=credentials&new-cred=1"
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors"
          >
            + Add Credential
          </a>
        )}
      </div>

      {/* Tab navigation */}
      <div className="flex gap-1 mb-6 bg-gray-900 rounded-lg p-1 border border-gray-800 w-fit">
        <a
          href="/admin/models?tab=providers"
          className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${
            tab === "providers"
              ? "bg-gray-800 text-white"
              : "text-gray-400 hover:text-gray-200"
          }`}
        >
          Providers
        </a>
        <a
          href="/admin/models?tab=credentials"
          className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${
            tab === "credentials"
              ? "bg-gray-800 text-white"
              : "text-gray-400 hover:text-gray-200"
          }`}
        >
          Credentials
        </a>
      </div>

      {tab === "providers" ? (
        <div className="bg-gray-900 border border-gray-800 rounded-lg">
          <div className="px-5 py-4 border-b border-gray-800">
            <h2 className="text-sm font-medium text-gray-400">
              {(providers?.length ?? 0)} providers configured
            </h2>
          </div>
          <div className="p-5">
            <ProviderList providers={providers ?? []} />
          </div>
        </div>
      ) : showCredentialForm ? (
        <div className="bg-gray-900 border border-gray-800 rounded-lg p-6">
          <h2 className="text-lg font-semibold text-white mb-4">Add Credential</h2>
          <CredentialForm providers={providers ?? []} />
        </div>
      ) : (
        <div className="bg-gray-900 border border-gray-800 rounded-lg">
          <div className="px-5 py-4 border-b border-gray-800">
            <h2 className="text-sm font-medium text-gray-400">
              {(credentials?.length ?? 0)} credentials
            </h2>
          </div>
          <div className="p-5">
            <CredentialList credentials={credentials ?? []} />
          </div>
        </div>
      )}
    </div>
  );
}
