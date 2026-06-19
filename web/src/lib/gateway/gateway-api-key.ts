import { createHash, randomBytes } from "crypto";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

export interface GatewayApiKeyRecord {
  id: string;
  name: string;
  key_prefix: string;
  is_active: boolean;
  model_credential_id: string;
  request_limit_per_minute: number;
}

export function hashGatewayKey(key: string) {
  return createHash("sha256").update(key).digest("hex");
}

export function createGatewayKeySecret() {
  return `sk-aisocial-${randomBytes(32).toString("base64url")}`;
}

export function getGatewayKeyPrefix(key: string) {
  return key.slice(0, 18);
}

export function readBearerToken(request: Request) {
  const auth = request.headers.get("authorization") || "";
  const match = auth.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || null;
}

export async function authenticateGatewayRequest(request: Request) {
  const token = readBearerToken(request);
  if (!token) return { error: "Missing Bearer API key.", status: 401 as const };

  const supabase = createServiceRoleClient();
  const { data, error } = await supabase
    .from("gateway_api_keys")
    .select("id, name, key_prefix, is_active, model_credential_id, request_limit_per_minute")
    .eq("key_hash", hashGatewayKey(token))
    .single();

  if (error || !data || !data.is_active) {
    return { error: "Invalid API key.", status: 401 as const };
  }

  return { apiKey: data as GatewayApiKeyRecord, supabase };
}
