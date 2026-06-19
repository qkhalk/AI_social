import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/admin/require-admin";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = await createClient();
    const adminCheck = await requireAdmin(supabase);
    if (adminCheck) return adminCheck;

    const body = await request.json().catch(() => ({}));
    const updates: Record<string, unknown> = {};

    if (body.name !== undefined) updates.name = String(body.name).slice(0, 120);
    if (body.is_active !== undefined) updates.is_active = Boolean(body.is_active);
    if (body.request_limit_per_minute !== undefined) {
      const limit = Number(body.request_limit_per_minute);
      if (!Number.isInteger(limit) || limit < 1 || limit > 600) {
        return NextResponse.json({ error: "request_limit_per_minute must be an integer from 1 to 600." }, { status: 400 });
      }
      updates.request_limit_per_minute = limit;
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: "No fields to update." }, { status: 400 });
    }

    const { data: { user } } = await supabase.auth.getUser();
    const { data, error } = await supabase
      .from("gateway_api_keys")
      .update(updates)
      .eq("id", id)
      .eq("admin_id", user!.id)
      .select("id, name, key_prefix, is_active, model_credential_id, request_limit_per_minute, created_at, last_used_at")
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ key: data });
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

    const { data: { user } } = await supabase.auth.getUser();
    const { error } = await supabase
      .from("gateway_api_keys")
      .update({ is_active: false })
      .eq("id", id)
      .eq("admin_id", user!.id);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Internal server error." }, { status: 500 });
  }
}
