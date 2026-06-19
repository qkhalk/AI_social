import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { GatewayApiKeyRecord } from "./gateway-api-key";

export async function checkGatewayRateLimit(
  supabase: ReturnType<typeof createServiceRoleClient>,
  apiKey: GatewayApiKeyRecord
) {
  const { data, error } = await supabase.rpc("gateway_consume_request", {
    p_api_key_id: apiKey.id,
    p_limit: apiKey.request_limit_per_minute,
  });

  if (error) return { allowed: false, error: "Unable to check rate limit." };
  if (!data) return { allowed: false, error: "Rate limit exceeded." };

  return { allowed: true };
}

export async function recordGatewayUsage(
  supabase: ReturnType<typeof createServiceRoleClient>,
  event: {
    api_key_id: string;
    model_name: string;
    provider_name?: string | null;
    status: "success" | "failed";
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
    cost_usd?: number;
    latency_ms?: number;
    error_message?: string | null;
  }
) {
  await supabase.from("gateway_usage_events").insert({
    prompt_tokens: 0,
    completion_tokens: 0,
    total_tokens: 0,
    cost_usd: 0,
    ...event,
    error_message: event.error_message?.slice(0, 500) || null,
  });

  await supabase
    .from("gateway_api_keys")
    .update({ last_used_at: new Date().toISOString() })
    .eq("id", event.api_key_id);
}
