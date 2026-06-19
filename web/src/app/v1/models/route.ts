import { NextResponse } from "next/server";
import { authenticateGatewayRequest } from "@/lib/gateway/gateway-api-key";
import { checkGatewayRateLimit, recordGatewayUsage } from "@/lib/gateway/gateway-rate-limit";
import { getDefaultGatewayCredential } from "@/lib/gateway/provider-credential";
import { fetchWithTimeout, readResponseTextBounded } from "@/lib/gateway/bounded-fetch";

const MODELS_TIMEOUT_MS = 10_000;
const MAX_PROVIDER_RESPONSE_BYTES = 2_000_000;

export async function GET(request: Request) {
  const started = Date.now();
  const auth = await authenticateGatewayRequest(request);
  if ("error" in auth) return NextResponse.json({ error: { message: auth.error } }, { status: auth.status });

  const limit = await checkGatewayRateLimit(auth.supabase, auth.apiKey);
  if (!limit.allowed) return NextResponse.json({ error: { message: limit.error } }, { status: 429 });

  const credential = await getDefaultGatewayCredential(auth.supabase, auth.apiKey.model_credential_id);
  if ("error" in credential) {
    await recordGatewayUsage(auth.supabase, {
      api_key_id: auth.apiKey.id,
      model_name: "models",
      status: "failed",
      latency_ms: Date.now() - started,
      error_message: credential.error,
    });
    return NextResponse.json({ error: { message: credential.error } }, { status: 503 });
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
