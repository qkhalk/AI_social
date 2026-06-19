import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/admin/require-admin";
import { decryptModelCredential } from "@/lib/encryption/decrypt-server";

type Provider = { name: string; api_base_url: string | null };
type ProviderJoin = Provider | Provider[] | null;

const DEFAULT_BASE_URL = "https://openrouter.ai/api/v1";
const TEST_TIMEOUT_MS = 10_000;
const MAX_ERROR_LENGTH = 500;

function normalizeProvider(provider: ProviderJoin) {
  return Array.isArray(provider) ? provider[0] : provider;
}

function trimSlash(value: string) {
  return value.replace(/\/+$/, "");
}

function sanitizeError(message: string, apiKey?: string) {
  let sanitized = message
    .replace(/Bearer\s+\S+/gi, "Bearer [redacted]")
    .replace(/api[_-]?key["'=:\s]+[^"',\s]+/gi, "[REDACTED]")
    .replace(/authorization["'=:\s]+[^"',\s]+/gi, "[REDACTED]");

  if (apiKey) sanitized = sanitized.split(apiKey).join("[redacted]");
  return sanitized.slice(0, MAX_ERROR_LENGTH);
}

function modelsUrl(baseUrl: string) {
  const normalized = trimSlash(baseUrl || DEFAULT_BASE_URL);
  return normalized.endsWith("/models") ? normalized : `${normalized}/models`;
}

function isPrivateHost(hostname: string) {
  const lower = hostname.toLowerCase();
  return (
    lower === "localhost" ||
    lower === "127.0.0.1" ||
    lower === "0.0.0.0" ||
    lower === "::1" ||
    lower.startsWith("10.") ||
    lower.startsWith("192.168.") ||
    /^172\.(1[6-9]|2\d|3[0-1])\./.test(lower)
  );
}

function resolveTestBaseUrl(provider: Provider | undefined, credentialBaseUrl: string | undefined) {
  if (provider?.name === "custom") {
    if (!credentialBaseUrl) return { error: "Custom provider requires a base URL." };
    const url = new URL(credentialBaseUrl);
    if (url.protocol !== "https:") return { error: "Custom provider test URL must use HTTPS." };
    if (isPrivateHost(url.hostname)) return { error: "Custom provider test URL cannot target a private host." };
    return { baseUrl: credentialBaseUrl };
  }

  return { baseUrl: provider?.api_base_url || DEFAULT_BASE_URL };
}

async function testBearerModelsEndpoint(baseUrl: string, apiKey: string) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TEST_TIMEOUT_MS);

  try {
    const response = await fetch(modelsUrl(baseUrl), {
      method: "GET",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        Accept: "application/json",
      },
      signal: controller.signal,
      cache: "no-store",
    });

    if (response.ok) return null;

    return `Provider returned HTTP ${response.status}.`;
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      return "Provider test timed out.";
    }
    return error instanceof Error ? error.message : "Provider test failed.";
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Test Google Gemini API key bằng cách gọi list models.
 * Gemini dùng query string `?key=...` thay vì Bearer header.
 */
async function testGeminiEndpoint(apiKey: string): Promise<string | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TEST_TIMEOUT_MS);

  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(apiKey)}`;
    const response = await fetch(url, {
      method: "GET",
      headers: { Accept: "application/json" },
      signal: controller.signal,
      cache: "no-store",
    });

    if (response.ok) return null;

    return `Google API returned HTTP ${response.status}.`;
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      return "Provider test timed out.";
    }
    return error instanceof Error ? error.message : "Provider test failed.";
  } finally {
    clearTimeout(timer);
  }
}

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = await createClient();
    const adminCheck = await requireAdmin(supabase);
    if (adminCheck) return adminCheck;

    const {
      data: { user },
    } = await supabase.auth.getUser();

    const { data: credential, error: fetchError } = await supabase
      .from("model_credentials")
      .select("id, encrypted_config, model_providers(name, api_base_url)")
      .eq("id", id)
      .eq("admin_id", user!.id)
      .single();

    if (fetchError || !credential) {
      return NextResponse.json({ error: "Credential not found." }, { status: 404 });
    }

    let failure: string | null = null;
    let apiKey: string | undefined;
    try {
      const config = decryptModelCredential(credential.encrypted_config as string);
      apiKey = config.api_key;
      if (!apiKey) {
        failure = "Credential config does not include an API key.";
      } else {
        const provider = normalizeProvider(credential.model_providers as ProviderJoin);
        if (!provider) {
          failure = "Provider not found for this credential.";
        } else if (provider.name === "google") {
          // Google Gemini: dùng ?key=... query string
          failure = await testGeminiEndpoint(apiKey);
        } else if (["openrouter", "openai", "custom"].includes(provider.name)) {
          // OpenAI-compatible
          const resolved = resolveTestBaseUrl(provider, config.base_url);
          failure = resolved.error || (await testBearerModelsEndpoint(resolved.baseUrl!, apiKey));
        } else if (provider.name === "anthropic") {
          // Anthropic chưa implement test — chỉ check format key
          if (!apiKey.startsWith("sk-ant-")) {
            failure = "Anthropic API keys should start with 'sk-ant-'.";
          }
        } else {
          failure = `Credential testing is not yet supported for provider '${provider.name}'.`;
        }
      }
    } catch (error) {
      failure = error instanceof Error ? error.message : "Unable to decrypt credential config.";
    }

    const update = {
      test_status: failure ? "failed" : "success",
      last_tested_at: new Date().toISOString(),
      last_test_error: failure ? sanitizeError(failure, apiKey) : null,
    };

    const { data, error: updateError } = await supabase
      .from("model_credentials")
      .update(update)
      .eq("id", id)
      .eq("admin_id", user!.id)
      .select("id, test_status, last_tested_at, last_test_error")
      .single();

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    return NextResponse.json({ credential: data }, { status: failure ? 400 : 200 });
  } catch {
    return NextResponse.json({ error: "Internal server error." }, { status: 500 });
  }
}