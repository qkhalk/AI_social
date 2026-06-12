/**
 * Credential selection logic for gateway routing.
 * Fetches active credentials for a provider, filters out locked ones,
 * and selects the best available using fill-first strategy.
 */

import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { decryptModelCredential } from "@/lib/encryption/decrypt-server";
import { isPrivateHost } from "@/lib/gateway/is-private-host";
import { getLockedModels } from "@/lib/gateway/credential-lock";

export interface CredentialRow {
  id: string;
  encrypted_config: string;
  priority: number;
  backoff_level: number;
  is_default: boolean;
  provider_name: string;
  provider_display_name: string;
  provider_base_url: string | null;
}

export interface ResolvedCredential {
  credentialId: string;
  providerName: string;
  displayName: string;
  baseUrl: string;
  apiKey: string;
}

const TRUSTED_HOSTS: Record<string, string> = {
  openrouter: "openrouter.ai",
  openai: "api.openai.com",
};

/**
 * Fetch all active credentials for a provider, sorted by priority ASC.
 */
export async function getCredentialsForProvider(
  providerName: string
): Promise<CredentialRow[]> {
  const supabase = createServiceRoleClient();

  const { data, error } = await supabase
    .from("model_credentials")
    .select(`
      id, encrypted_config, priority, backoff_level, is_default,
      model_providers!inner(name, display_name, api_base_url)
    `)
    .eq("is_active", true)
    .eq("model_providers.name", providerName)
    .order("priority", { ascending: true })
    .order("is_default", { ascending: false })
    .order("created_at", { ascending: true });

  if (error || !data) return [];

  return data.map((row) => {
    const provider = Array.isArray(row.model_providers)
      ? row.model_providers[0]
      : row.model_providers;
    return {
      id: row.id,
      encrypted_config: row.encrypted_config,
      priority: row.priority ?? 0,
      backoff_level: row.backoff_level ?? 0,
      is_default: row.is_default ?? false,
      provider_name: provider?.name || providerName,
      provider_display_name: provider?.display_name || providerName,
      provider_base_url: provider?.api_base_url || null,
    };
  });
}

/**
 * Select the best available credential for a model request.
 * Filters out credentials with active model locks, picks highest priority.
 */
export async function selectCredential(
  credentials: CredentialRow[],
  modelName: string
): Promise<ResolvedCredential | null> {
  for (const cred of credentials) {
    const locked = await getLockedModels(cred.id);
    if (locked.has(modelName)) continue;

    const resolved = resolveCredential(cred);
    if (!resolved) continue;

    // Update last_used_at for round-robin tracking
    const supabase = createServiceRoleClient();
    await supabase
      .from("model_credentials")
      .update({ last_used_at: new Date().toISOString() })
      .eq("id", cred.id);

    return resolved;
  }

  return null;
}

/**
 * Decrypt and validate a credential row into a usable credential.
 */
function resolveCredential(cred: CredentialRow): ResolvedCredential | null {
  const config = decryptModelCredential(cred.encrypted_config);
  const apiKey = config.api_key;
  if (!apiKey) return null;

  const baseUrl = resolveSafeBaseUrl(
    cred.provider_name,
    cred.provider_base_url,
    config.base_url
  );
  if (!baseUrl) return null;

  return {
    credentialId: cred.id,
    providerName: cred.provider_name,
    displayName: cred.provider_display_name,
    baseUrl,
    apiKey,
  };
}

/**
 * Validate and resolve a safe base URL for the provider.
 * Returns null if URL is invalid, private, or host mismatch.
 */
function resolveSafeBaseUrl(
  providerName: string,
  providerBaseUrl: string | null,
  credentialBaseUrl?: string
): string | null {
  const rawBaseUrl = providerName === "custom" ? credentialBaseUrl : providerBaseUrl;
  if (!rawBaseUrl) return null;

  let url: URL;
  try { url = new URL(rawBaseUrl); } catch { return null; }
  if (url.protocol !== "https:") return null;
  if (isPrivateHost(url.hostname)) return null;

  const trustedHost = TRUSTED_HOSTS[providerName];
  if (trustedHost && url.hostname !== trustedHost) return null;

  return rawBaseUrl.replace(/\/+$/, "");
}
