/**
 * Gateway chat completions route with multi-credential fallback loop.
 * Tries credentials in priority order; on error, locks the model on that
 * credential and tries the next one. Max 3 attempts per request.
 */

import { NextResponse } from "next/server";
import { authenticateGatewayRequest } from "@/lib/gateway/gateway-api-key";
import { checkGatewayRateLimit, recordGatewayUsage } from "@/lib/gateway/gateway-rate-limit";
import { getCredentialsForProvider, selectCredential } from "@/lib/gateway/credential-selector";
import { lockCredential, unlockCredential } from "@/lib/gateway/credential-lock";
import { incrementBackoffLevel, resetBackoffLevel } from "@/lib/gateway/credential-backoff";
import { classifyError } from "@/lib/gateway/error-classifier";
import { enforceRequestBodyLimit, fetchWithTimeout, readResponseTextBounded } from "@/lib/gateway/bounded-fetch";

const MAX_REQUEST_BODY_BYTES = 128_000;
const MAX_PROVIDER_RESPONSE_BYTES = 2_000_000;
const CHAT_TIMEOUT_MS = 60_000;
const MAX_FALLBACK_ATTEMPTS = 3;

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

/**
 * Determine which provider to use based on the requested model.
 * Currently only OpenAI-compatible providers are routable.
 */
function detectProvider(modelName: string): "openai" | "openrouter" | null {
  const lower = modelName.toLowerCase();
  if (lower.startsWith("gpt-") || lower.startsWith("o1-") || lower.startsWith("o3-")) return "openai";
  if (lower.includes("/") || lower.startsWith("anthropic/") || lower.startsWith("claude/")) return "openrouter";
  return "openrouter";
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

  const providerName = detectProvider(requestedModel);
  if (!providerName) {
    return NextResponse.json({ error: { message: "Unsupported model for gateway routing." } }, { status: 400 });
  }

  // Fetch all active credentials for the detected provider
  const credentials = await getCredentialsForProvider(providerName);
  if (credentials.length === 0) {
    await recordGatewayUsage(auth.supabase, {
      api_key_id: auth.apiKey.id,
      model_name: requestedModel,
      status: "failed",
      latency_ms: Date.now() - started,
      error_message: `No active credentials for provider ${providerName}.`,
    });
    return NextResponse.json({ error: { message: `No active credentials for provider ${providerName}.` } }, { status: 503 });
  }

  // Fallback loop: try credentials in priority order
  const triedCredentialIds = new Set<string>();
  const errors: string[] = [];

  for (let attempt = 0; attempt < MAX_FALLBACK_ATTEMPTS; attempt++) {
    const remainingCredentials = credentials.filter((c) => !triedCredentialIds.has(c.id));
    const credential = await selectCredential(remainingCredentials, requestedModel);

    if (!credential) {
      errors.push("No unlocked credentials available.");
      break;
    }

    triedCredentialIds.add(credential.credentialId);

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

      if (response.ok) {
        // Success: clear lock + reset backoff
        await unlockCredential(credential.credentialId, requestedModel);
        await resetBackoffLevel(credential.credentialId);

        const rawText = await readResponseTextBounded(response, MAX_PROVIDER_RESPONSE_BYTES);
        let json: unknown = null;
        try { json = JSON.parse(rawText); } catch { json = null; }
        const usage = json ? getUsage(json) : { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 };

        await recordGatewayUsage(auth.supabase, {
          api_key_id: auth.apiKey.id,
          model_name: requestedModel,
          provider_name: credential.providerName,
          status: "success",
          ...usage,
          latency_ms: Date.now() - started,
        });

        return new Response(rawText, {
          status: response.status,
          headers: { "content-type": response.headers.get("content-type") || "application/json" },
        });
      }

      // Error response: classify and lock
      const errorText = await readResponseTextBounded(response, MAX_PROVIDER_RESPONSE_BYTES);
      const classified = classifyError({ status: response.status, body: errorText });
      const cooldownSec = Math.min(300, classified.baseCooldown * (2 ** (remainingCredentials[0]?.backoff_level || 0)));

      await lockCredential(credential.credentialId, requestedModel, classified.type, errorText, cooldownSec);
      await incrementBackoffLevel(credential.credentialId);

      errors.push(`Credential ${credential.credentialId}: HTTP ${response.status} (${classified.type})`);
    } catch {
      // Network/timeout error
      await lockCredential(credential.credentialId, requestedModel, "connection_error", "Unable to reach provider.", 30);
      errors.push(`Credential ${credential.credentialId}: connection error`);
    }
  }

  // All credentials exhausted
  const finalError = errors.length > 0 ? errors.join("; ") : "All credentials exhausted.";
  await recordGatewayUsage(auth.supabase, {
    api_key_id: auth.apiKey.id,
    model_name: requestedModel,
    status: "failed",
    latency_ms: Date.now() - started,
    error_message: finalError,
  });
  return NextResponse.json({ error: { message: finalError } }, { status: 503 });
}
