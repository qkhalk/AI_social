/**
 * Gateway models listing route. Uses single best credential for model listing
 * (no fallback loop needed -- listing is non-critical and idempotent).
 */

import { NextResponse } from "next/server";
import { authenticateGatewayRequest } from "@/lib/gateway/gateway-api-key";
import { checkGatewayRateLimit, recordGatewayUsage } from "@/lib/gateway/gateway-rate-limit";
import { getCredentialsForProvider, selectCredential } from "@/lib/gateway/credential-selector";
import { fetchWithTimeout, readResponseTextBounded } from "@/lib/gateway/bounded-fetch";

const MODELS_TIMEOUT_MS = 10_000;
const MAX_PROVIDER_RESPONSE_BYTES = 2_000_000;

export async function GET(request: Request) {
  const started = Date.now();
  const auth = await authenticateGatewayRequest(request);
  if ("error" in auth) return NextResponse.json({ error: { message: auth.error } }, { status: auth.status });

  const limit = await checkGatewayRateLimit(auth.supabase, auth.apiKey);
  if (!limit.allowed) return NextResponse.json({ error: { message: limit.error } }, { status: 429 });

  // Try openrouter first (broader model catalog)
  const openrouterCreds = await getCredentialsForProvider("openrouter");
  let credential = await selectCredential(openrouterCreds, "models");

  if (!credential) {
    const openaiCreds = await getCredentialsForProvider("openai");
    credential = await selectCredential(openaiCreds, "models");
  }

  if (!credential) {
    const customCreds = await getCredentialsForProvider("custom");
    credential = await selectCredential(customCreds, "models");
  }

  if (!credential) {
    await recordGatewayUsage(auth.supabase, {
      api_key_id: auth.apiKey.id,
      model_name: "models",
      status: "failed",
      latency_ms: Date.now() - started,
      error_message: "No active credentials available for model listing.",
    });
    return NextResponse.json({ error: { message: "No active credentials available." } }, { status: 503 });
  }

  try {
    const response = await fetchWithTimeout(`${credential.baseUrl}/models`, {
      headers: { Authorization: `Bearer ${credential.apiKey}`, Accept: "application/json" },
      cache: "no-store",
    }, MODELS_TIMEOUT_MS);
    const text = response.ok ? await readResponseTextBounded(response, MAX_PROVIDER_RESPONSE_BYTES) : JSON.stringify({ error: { message: `Provider returned HTTP ${response.status}.`, type: "provider_error" } });
    await recordGatewayUsage(auth.supabase, {
      api_key_id: auth.apiKey.id,
      model_name: "models",
      provider_name: credential.providerName,
      status: response.ok ? "success" : "failed",
      latency_ms: Date.now() - started,
      error_message: response.ok ? null : `Provider returned HTTP ${response.status}.`,
    });

    return new Response(text, {
      status: response.status,
      headers: { "content-type": response.headers.get("content-type") || "application/json" },
    });
  } catch {
    await recordGatewayUsage(auth.supabase, {
      api_key_id: auth.apiKey.id,
      model_name: "models",
      provider_name: credential.providerName,
      status: "failed",
      latency_ms: Date.now() - started,
      error_message: "Unable to reach provider.",
    });
    return NextResponse.json({ error: { message: "Unable to reach provider." } }, { status: 502 });
  }
}
