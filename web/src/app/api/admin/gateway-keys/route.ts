import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/admin/require-admin";
import { createGatewayKeySecret, getGatewayKeyPrefix, hashGatewayKey } from "@/lib/gateway/gateway-api-key";

export async function GET() {
  try {
    const supabase = await createClient();
    const adminCheck = await requireAdmin(supabase);
    if (adminCheck) return adminCheck;

    const { data, error } = await supabase
      .from("gateway_api_keys")
      .select("id, name, key_prefix, is_active, model_credential_id, request_limit_per_minute, created_at, last_used_at")
      .order("created_at", { ascending: false });

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ keys: data });
  } catch {
    return NextResponse.json({ error: "Internal server error." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const adminCheck = await requireAdmin(supabase);
    if (adminCheck) return adminCheck;

    const { data: { user } } = await supabase.auth.getUser();
    const body = await request.json().catch(() => ({}));
    const modelCredentialId = String(body.model_credential_id || "");
    const requestLimit = Number(body.request_limit_per_minute || 60);

    if (!modelCredentialId) {
      return NextResponse.json({ error: "model_credential_id is required." }, { status: 400 });
    }
    if (!Number.isInteger(requestLimit) || requestLimit < 1 || requestLimit > 600) {
      return NextResponse.json({ error: "request_limit_per_minute must be an integer from 1 to 600." }, { status: 400 });
    }

    const { data: credential } = await supabase
      .from("model_credentials")
      .select("id, model_providers(name)")
      .eq("id", modelCredentialId)
      .eq("admin_id", user!.id)
      .eq("is_active", true)
      .single();

    if (!credential) {
      return NextResponse.json({ error: "Active model credential not found." }, { status: 404 });
    }

    const provider = Array.isArray(credential.model_providers) ? credential.model_providers[0] : credential.model_providers;
    if (!provider || !["openrouter", "openai", "custom"].includes(provider.name)) {
      return NextResponse.json({ error: "Gateway keys currently require OpenRouter, OpenAI, or a custom OpenAI-compatible credential." }, { status: 400 });
    }

    const secret = createGatewayKeySecret();

    const { data, error } = await supabase
      .from("gateway_api_keys")
      .insert({
        admin_id: user!.id,
        model_credential_id: modelCredentialId,
        name: String(body.name || "Gateway API Key").slice(0, 120),
        key_prefix: getGatewayKeyPrefix(secret),
        key_hash: hashGatewayKey(secret),
        request_limit_per_minute: requestLimit,
      })
      .select("id, name, key_prefix, is_active, model_credential_id, request_limit_per_minute, created_at")
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ key: data, secret }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Internal server error." }, { status: 500 });
  }
}
