import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/admin/require-admin";
import { encryptJson } from "@/lib/encryption/encrypt";

/**
 * GET /api/admin/credentials/[id] — get single credential (no decrypted config returned)
 * PATCH /api/admin/credentials/[id] — update credential
 * DELETE /api/admin/credentials/[id] — delete credential
 */

export async function GET(
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

    const { data, error } = await supabase
      .from("model_credentials")
      .select("id, credential_name, provider_id, is_default, is_active, created_at, updated_at, model_providers(name, display_name)")
      .eq("id", id)
      .eq("admin_id", user!.id)
      .single();

    if (error || !data) {
      return NextResponse.json({ error: "Credential not found." }, { status: 404 });
    }

    return NextResponse.json({ credential: data });
  } catch {
    return NextResponse.json({ error: "Internal server error." }, { status: 500 });
  }
}

export async function PATCH(
  request: Request,
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

    const body = await request.json();
    const updates: Record<string, unknown> = {};

    if (body.credential_name !== undefined) updates.credential_name = body.credential_name;
    if (body.is_active !== undefined) updates.is_active = body.is_active;

    // Re-encrypt if new config is provided
    if (body.config && typeof body.config === "object") {
      const encryptionKey = process.env.ENCRYPTION_KEY;
      if (!encryptionKey) {
        return NextResponse.json({ error: "Encryption not configured." }, { status: 500 });
      }
      updates.encrypted_config = encryptJson(body.config, encryptionKey);
    }

    // Handle default toggle
    if (body.is_default === true) {
      const { data: current } = await supabase
        .from("model_credentials")
        .select("provider_id")
        .eq("id", id)
        .single();

      if (current) {
        await supabase
          .from("model_credentials")
          .update({ is_default: false })
          .eq("provider_id", current.provider_id)
          .eq("admin_id", user!.id);
      }
      updates.is_default = true;
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: "No fields to update." }, { status: 400 });
    }

    const { data, error } = await supabase
      .from("model_credentials")
      .update(updates)
      .eq("id", id)
      .eq("admin_id", user!.id)
      .select("id, credential_name, provider_id, is_default, is_active, created_at")
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ credential: data });
  } catch {
    return NextResponse.json({ error: "Internal server error." }, { status: 500 });
  }
}

export async function DELETE(
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

    const { error } = await supabase
      .from("model_credentials")
      .delete()
      .eq("id", id)
      .eq("admin_id", user!.id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Internal server error." }, { status: 500 });
  }
}
