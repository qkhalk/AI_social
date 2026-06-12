/**
 * Gateway credential resolution: backwards-compatible single credential lookup.
 * For multi-credential fallback/routing, use credential-selector.ts instead.
 */

import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { decryptModelCredential } from "@/lib/encryption/decrypt-server";
import { isPrivateHost } from "@/lib/gateway/is-private-host";

type ProviderJoin = { name: string; display_name: string; api_base_url: string | null } | { name: string; display_name: string; api_base_url: string | null }[] | null;

function normalizeProvider(provider: ProviderJoin) {
  return Array.isArray(provider) ? provider[0] : provider;
}

export async function getDefaultGatewayCredential(
  supabase: ReturnType<typeof createServiceRoleClient>,
  modelCredentialId?: string
) {
  let query = supabase
    .from("model_credentials")
    .select("id, encrypted_config, is_default, model_providers(name, display_name, api_base_url)")
    .eq("is_active", true)
    .limit(1);

  query = modelCredentialId
    ? query.eq("id", modelCredentialId)
    : query.order("is_default", { ascending: false }).order("created_at", { ascending: true });

  const { data, error } = await query.single();

  if (error || !data) {
    const envKey = process.env.OPENROUTER_API_KEY;
    if (!envKey) return { error: "No active provider credential configured." };
    return {
      providerName: "openrouter",
      displayName: "OpenRouter",
      baseUrl: "https://openrouter.ai/api/v1",
      apiKey: envKey,
    };
  }

  const provider = normalizeProvider(data.model_providers as ProviderJoin);
  if (!provider || !["openrouter", "openai", "custom"].includes(provider.name)) {
    return { error: "Gateway credential provider is not OpenAI-compatible." };
  }

  const config = decryptModelCredential(data.encrypted_config as string);
  const apiKey = config.api_key;
  const baseUrlResult = resolveSafeBaseUrl(provider?.name || "custom", provider?.api_base_url || null, config.base_url);

  if (!apiKey) return { error: "Default provider credential is missing an API key." };
  if (baseUrlResult.error) return { error: baseUrlResult.error };

  return {
    providerName: provider?.name || "custom",
    displayName: provider?.display_name || "Custom",
    baseUrl: baseUrlResult.baseUrl!,
    apiKey,
  };
}

function resolveSafeBaseUrl(providerName: string, providerBaseUrl: string | null, credentialBaseUrl?: string) {
  const trustedHosts: Record<string, string> = {
    openrouter: "openrouter.ai",
    openai: "api.openai.com",
  };

  const rawBaseUrl = providerName === "custom"
    ? credentialBaseUrl
    : providerBaseUrl;

  if (!rawBaseUrl) return { error: "Provider base URL is not configured." };

  let url: URL;
  try { url = new URL(rawBaseUrl); } catch { return { error: "Provider base URL is invalid." }; }
  if (url.protocol !== "https:") return { error: "Provider base URL must use HTTPS." };
  if (isPrivateHost(url.hostname)) return { error: "Provider base URL cannot target a private host." };

  const trustedHost = trustedHosts[providerName];
  if (trustedHost && url.hostname !== trustedHost) {
    return { error: "Provider base URL does not match the expected host." };
  }

  return { baseUrl: rawBaseUrl.replace(/\/+$/, "") };
}
