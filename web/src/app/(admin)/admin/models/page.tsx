import { createClient } from "@/lib/supabase/server";
import { ModelsPageClient } from "@/components/admin/models-page-client";

/**
 * Models management page — single-page layout grouped by provider.
 * Replaces the previous two-tab UI (Providers / Credentials).
 * Admin manages credentials (encrypted API keys) per provider.
 */
export default async function ModelsPage() {
  const supabase = await createClient();

  // Fetch providers
  const { data: providers } = await supabase
    .from("model_providers")
    .select("id, name, display_name, auth_type, api_base_url, is_active")
    .order("display_name", { ascending: true });

  // Fetch credentials with new routing fields
  const { data: credentials } = await supabase
    .from("model_credentials")
    .select("id, credential_name, provider_id, priority, is_default, is_active, test_status, last_tested_at, last_test_error, backoff_level, last_used_at, created_at")
    .order("priority", { ascending: true });

  // Group credentials under providers
  const providerData = (providers || []).map((p) => ({
    id: p.id,
    name: p.name,
    display_name: p.display_name,
    auth_type: p.auth_type,
    api_base_url: p.api_base_url,
    is_active: p.is_active,
    credentials: (credentials || [])
      .filter((c) => c.provider_id === p.id)
      .map((c) => ({
        id: c.id,
        credential_name: c.credential_name,
        provider_id: c.provider_id,
        priority: c.priority ?? 0,
        is_default: c.is_default ?? false,
        is_active: c.is_active ?? true,
        test_status: c.test_status as "untested" | "testing" | "success" | "failed" | null,
        last_tested_at: c.last_tested_at,
        last_test_error: c.last_test_error,
        backoff_level: c.backoff_level ?? 0,
        last_used_at: c.last_used_at,
      })),
  }));

  const providerOptions = (providers || []).map((p) => ({
    id: p.id,
    name: p.name,
    display_name: p.display_name,
  }));

  return <ModelsPageClient providers={providerOptions} initialProviderData={providerData} />;
}
