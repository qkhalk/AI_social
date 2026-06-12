import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/admin/require-admin";
import { encryptJson } from "@/lib/encryption/encrypt";

/**
 * GET /api/admin/credentials — list all credentials for current admin
 * POST /api/admin/credentials — create a new credential (encrypts config)
 */
export async function GET() {
  try {
    const supabase = await createClient();
    const adminCheck = await requireAdmin(supabase);
    if (adminCheck) return adminCheck;

    const {
      data: { user },
    } = await supabase.auth.getUser();

    const { data, error } = await supabase
      .from("model_credentials")
      .select("id, credential_name, provider_id, priority, is_default, is_active, test_status, last_tested_at, last_test_error, backoff_level, last_used_at, created_at, updated_at, model_providers(name, display_name)")
      .eq("admin_id", user!.id)
      .order("created_at", { ascending: false });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ credentials: data });
  } catch {
    return NextResponse.json({ error: "Internal server error." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const adminCheck = await requireAdmin(supabase);
    if (adminCheck) return adminCheck;

    const {
      data: { user },
    } = await supabase.auth.getUser();

    const body = await request.json();

    if (!body.provider_id || typeof body.provider_id !== "string") {
      return NextResponse.json({ error: "Provider ID is required." }, { status: 400 });
    }
    if (!body.config || typeof body.config !== "object") {
      return NextResponse.json({ error: "Config object with api_key is required." }, { status: 400 });
    }

    // Resolve credential_name: accept empty string and default to provider display name
    let credentialName = typeof body.credential_name === "string" ? body.credential_name.trim() : "";
    if (!credentialName) {
      const { data: provider } = await supabase
        .from("model_providers")
        .select("display_name")
        .eq("id", body.provider_id)
        .single();
      credentialName = provider?.display_name ? `${provider.display_name} Key` : "Unnamed Credential";
    }

    // Encrypt the config
    const encryptionKey = process.env.ENCRYPTION_KEY;
    if (!encryptionKey) {
      return NextResponse.json({ error: "Encryption not configured." }, { status: 500 });
    }

    const encryptedConfig = encryptJson(body.config, encryptionKey);

    // If this is set as default, unset other defaults for same provider
    if (body.is_default) {
      await supabase
        .from("model_credentials")
        .update({ is_default: false })
        .eq("provider_id", body.provider_id)
        .eq("admin_id", user!.id);
    }

    const { data, error } = await supabase
      .from("model_credentials")
      .insert({
        provider_id: body.provider_id,
        admin_id: user!.id,
        credential_name: credentialName,
        encrypted_config: encryptedConfig,
        is_default: body.is_default ?? false,
        is_active: body.is_active ?? true,
        priority: typeof body.priority === "number" ? body.priority : 0,
        test_status: "untested",
        last_tested_at: null,
        last_test_error: null,
      })
      .select("id, credential_name, provider_id, priority, is_default, is_active, test_status, last_tested_at, last_test_error, created_at")
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ credential: data }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Internal server error." }, { status: 500 });
  }
}
