import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/admin/require-admin";
import { decryptModelCredential } from "@/lib/encryption/decrypt-server";
import { isPrivateHost } from "@/lib/gateway/is-private-host";

const MAX_CREDENTIALS = 10;
const CONCURRENCY_LIMIT = 3;
const TEST_TIMEOUT_MS = 10_000;
const DEFAULT_BASE_URL = "https://openrouter.ai/api/v1";
const MAX_ERROR_LENGTH = 500;

type ProviderJoin = { name: string; api_base_url: string | null } | { name: string; api_base_url: string | null }[] | null;

function normalizeProvider(p: ProviderJoin) {
  return Array.isArray(p) ? p[0] : p;
}

function trimSlash(v: string) {
  return v.replace(/\/+$/, "");
}

function sanitizeError(message: string, apiKey?: string) {
  let s = message
    .replace(/Bearer\s+\S+/gi, "Bearer [redacted]")
    .replace(/api[_-]?key["'=:\s]+[^"',\s]+/gi, "api_key=[redacted]");
  if (apiKey) s = s.split(apiKey).join("[redacted]");
  return s.slice(0, MAX_ERROR_LENGTH);
}

function modelsUrl(baseUrl: string) {
  const n = trimSlash(baseUrl || DEFAULT_BASE_URL);
  return n.endsWith("/models") ? n : `${n}/models`;
}

function resolveTestBaseUrl(provider: { name: string; api_base_url: string | null } | undefined, credentialBaseUrl: string | undefined) {
  if (provider?.name === "custom") {
    if (!credentialBaseUrl) return { error: "Custom provider requires a base URL." };
    try {
      const url = new URL(credentialBaseUrl);
      if (url.protocol !== "https:") return { error: "Custom provider test URL must use HTTPS." };
      if (isPrivateHost(url.hostname)) return { error: "Custom provider test URL cannot target a private host." };
    } catch {
      return { error: "Custom provider base URL is invalid." };
    }
    return { baseUrl: credentialBaseUrl };
  }
  return { baseUrl: provider?.api_base_url || DEFAULT_BASE_URL };
}

async function testOne(credentialId: string, encryptedConfig: string, providerJoin: ProviderJoin) {
  let failure: string | null = null;
  let apiKey: string | undefined;
  try {
    const config = decryptModelCredential(encryptedConfig);
    apiKey = config.api_key;
    if (!apiKey) {
      failure = "Credential config does not include an API key.";
    } else {
      const provider = normalizeProvider(providerJoin);
      if (!provider || !["openrouter", "openai", "custom"].includes(provider.name)) {
        failure = "Credential testing is not supported for this provider yet.";
      } else {
        const resolved = resolveTestBaseUrl(provider, config.base_url);
        if (resolved.error) {
          failure = resolved.error;
        } else {
          const controller = new AbortController();
          const timer = setTimeout(() => controller.abort(), TEST_TIMEOUT_MS);
          try {
            const response = await fetch(modelsUrl(resolved.baseUrl!), {
              method: "GET",
              headers: { Authorization: `Bearer ${apiKey}`, Accept: "application/json" },
              signal: controller.signal,
              cache: "no-store",
            });
            if (!response.ok) failure = `Provider returned HTTP ${response.status}.`;
          } catch (error) {
            failure = error instanceof Error ? error.name === "AbortError" ? "Test timed out." : error.message : "Test failed.";
          } finally {
            clearTimeout(timer);
          }
        }
      }
    }
  } catch (error) {
    failure = error instanceof Error ? error.message : "Unable to decrypt credential config.";
  }

  return {
    id: credentialId,
    test_status: failure ? "failed" : "success",
    last_tested_at: new Date().toISOString(),
    last_test_error: failure ? sanitizeError(failure, apiKey) : null,
  };
}

/**
 * POST /api/admin/credentials/batch-test
 * Body: { credential_ids: string[] }
 * Tests up to 10 credentials in parallel with concurrency limit of 3.
 */
export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const adminCheck = await requireAdmin(supabase);
    if (adminCheck) return adminCheck;

    const { data: { user } } = await supabase.auth.getUser();
    const body = await request.json();

    if (!Array.isArray(body.credential_ids) || body.credential_ids.length === 0) {
      return NextResponse.json({ error: "credential_ids array is required." }, { status: 400 });
    }
    if (body.credential_ids.length > MAX_CREDENTIALS) {
      return NextResponse.json({ error: `Maximum ${MAX_CREDENTIALS} credentials per batch.` }, { status: 400 });
    }

    const { data: credentials, error: fetchError } = await supabase
      .from("model_credentials")
      .select("id, encrypted_config, model_providers(name, api_base_url)")
      .eq("admin_id", user!.id)
      .in("id", body.credential_ids);

    if (fetchError) {
      return NextResponse.json({ error: fetchError.message }, { status: 500 });
    }
    if (!credentials || credentials.length !== body.credential_ids.length) {
      return NextResponse.json({ error: "One or more credentials not found." }, { status: 403 });
    }

    // Run tests in parallel with concurrency limit
    const results: Array<{ id: string; test_status: string; last_tested_at: string; last_test_error: string | null }> = [];
    const queue = [...credentials];
    const workers = Array.from({ length: Math.min(CONCURRENCY_LIMIT, queue.length) }, async () => {
      while (queue.length > 0) {
        const cred = queue.shift();
        if (!cred) break;
        const result = await testOne(cred.id, cred.encrypted_config, cred.model_providers as ProviderJoin);
        results.push(result);
        // Persist to DB
        await supabase
          .from("model_credentials")
          .update({
            test_status: result.test_status,
            last_tested_at: result.last_tested_at,
            last_test_error: result.last_test_error,
          })
          .eq("id", result.id);
      }
    });
    await Promise.all(workers);

    return NextResponse.json({ results });
  } catch {
    return NextResponse.json({ error: "Internal server error." }, { status: 500 });
  }
}
