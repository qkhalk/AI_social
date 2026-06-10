import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/admin/require-admin";

/**
 * GET /api/admin/providers/[id] — get single provider
 * PATCH /api/admin/providers/[id] — update provider
 * DELETE /api/admin/providers/[id] — delete provider
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

    const { data, error } = await supabase
      .from("model_providers")
      .select("*")
      .eq("id", id)
      .single();

    if (error || !data) {
      return NextResponse.json({ error: "Provider not found." }, { status: 404 });
    }

    return NextResponse.json({ provider: data });
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

    const body = await request.json();
    const updates: Record<string, unknown> = {};

    if (body.display_name !== undefined) updates.display_name = body.display_name;
    if (body.auth_type !== undefined) updates.auth_type = body.auth_type;
    if (body.api_base_url !== undefined) updates.api_base_url = body.api_base_url;
    if (body.icon_url !== undefined) updates.icon_url = body.icon_url;
    if (body.config_schema !== undefined) updates.config_schema = body.config_schema;
    if (body.is_active !== undefined) updates.is_active = body.is_active;

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: "No fields to update." }, { status: 400 });
    }

    const { data, error } = await supabase
      .from("model_providers")
      .update(updates)
      .eq("id", id)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ provider: data });
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

    const { error } = await supabase
      .from("model_providers")
      .delete()
      .eq("id", id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Internal server error." }, { status: 500 });
  }
}
