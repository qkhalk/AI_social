import { NextResponse } from "next/server";
import { authenticateGatewayRequest } from "@/lib/gateway/gateway-api-key";
import { checkGatewayRateLimit, recordGatewayUsage } from "@/lib/gateway/gateway-rate-limit";
import { getDefaultGatewayCredential } from "@/lib/gateway/provider-credential";
import { enforceRequestBodyLimit, fetchWithTimeout, readResponseTextBounded } from "@/lib/gateway/bounded-fetch";

const MAX_REQUEST_BODY_BYTES = 128_000;
const MAX_PROVIDER_RESPONSE_BYTES = 2_000_000;
const CHAT_TIMEOUT_MS = 60_000;

function getUsage(payload: unknown) {
  const usage = (payload as { usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number } })?.usage;
  return {
    prompt_tokens: usage?.prompt_tokens || 0,
    completion_tokens: usage?.completion_tokens || 0,
    total_tokens: usage?.total_tokens || 0,
  };
}

function validateGatewayChatBody(body: Record<string, unknown>) {
  const messages = body.messages;
  if (!Array.isArray(messages)) return "messages array is required.";
  if (messages.length < 1 || messages.length > 50) return "messages must contain 1 to 50 items.";

  let totalContentLength = 0;
  for (const message of messages) {
    const content = (message as { content?: unknown })?.content;
    if (typeof content === "string") totalContentLength += content.length;
    else if (Array.isArray(content)) totalContentLength += JSON.stringify(content).length;
    else if (content !== undefined && content !== null) return "message content must be text or an array.";
  }

  if (totalContentLength > 40_000) return "message content is too large.";

  if (body.max_tokens !== undefined) {
    const maxTokens = Number(body.max_tokens);
    if (!Number.isInteger(maxTokens) || maxTokens < 1 || maxTokens > 4096) {
      return "max_tokens must be an integer from 1 to 4096.";
    }
  }

  if (body.n !== undefined && Number(body.n) !== 1) return "n must be 1 when provided.";
  if (body.stream === true) return "Streaming is not enabled for this gateway yet.";
  return null;
}

export async function POST(request: Request) {
  const started = Date.now();
  const auth = await authenticateGatewayRequest(request);
  if ("error" in auth) return NextResponse.json({ error: { message: auth.error } }, { status: auth.status });

  const limit = await checkGatewayRateLimit(auth.supabase, auth.apiKey);
  if (!limit.allowed) return NextResponse.json({ error: { message: limit.error } }, { status: 429 });

  const bodyLimitError = enforceRequestBodyLimit(request, MAX_REQUEST_BODY_BYTES);
  if (bodyLimitError) {
    return NextResponse.json({ error: { message: bodyLimitError, type: "invalid_request_error" } }, { status: 413 });
  }

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: { message: "JSON object body is required." } }, { status: 400 });
  }

  const validationError = validateGatewayChatBody(body as Record<string, unknown>);
  if (validationError) return NextResponse.json({ error: { message: validationError, type: "invalid_request_error" } }, { status: 400 });

  const requestedModel = String((body as { model?: string }).model || "");
  if (!requestedModel) return NextResponse.json({ error: { message: "model is required." } }, { status: 400 });

  const credential = await getDefaultGatewayCredential(auth.supabase, auth.apiKey.model_credential_id);
  if ("error" in credential) {
    await recordGatewayUsage(auth.supabase, {
      api_key_id: auth.apiKey.id,
      model_name: requestedModel,
      status: "failed",
      latency_ms: Date.now() - started,
      error_message: credential.error,
    });
    return NextResponse.json({ error: { message: credential.error } }, { status: 503 });
  }

  try {
    const response = await fetchWithTimeout(`${credential.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${credential.apiKey}`,
        "Content-Type": "application/json",
        Accept: (body as { stream?: boolean }).stream ? "text/event-stream" : "application/json",
      },
      body: JSON.stringify(body),
      cache: "no-store",
    }, CHAT_TIMEOUT_MS);

    const rawText = response.ok ? await readResponseTextBounded(response, MAX_PROVIDER_RESPONSE_BYTES) : "";
    const text = response.ok ? rawText : JSON.stringify({ error: { message: `Provider returned HTTP ${response.status}.`, type: "provider_error" } });
    let json: unknown = null;
    try { json = JSON.parse(text); } catch { json = null; }
    const usage = response.ok && json ? getUsage(json) : { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 };

    await recordGatewayUsage(auth.supabase, {
      api_key_id: auth.apiKey.id,
      model_name: requestedModel,
      provider_name: credential.providerName,
      status: response.ok ? "success" : "failed",
      ...usage,
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
      model_name: requestedModel,
      provider_name: credential.providerName,
      status: "failed",
      latency_ms: Date.now() - started,
      error_message: "Unable to reach provider.",
    });
    return NextResponse.json({ error: { message: "Unable to reach provider." } }, { status: 502 });
  }
}
