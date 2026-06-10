import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/admin/require-admin";

/**
 * GET    /api/admin/agents/[id] — fetch single agent
 * PATCH  /api/admin/agents/[id] — update agent
 * DELETE /api/admin/agents/[id] — delete agent
 */

type Ctx = { params: { id: string } };

export async function GET(_req: Request, { params }: Ctx) {
  try {
    const supabase = await createClient();
    const adminErr = await requireAdmin(supabase);
    if (adminErr) return adminErr;

    const { data, error } = await supabase
      .from("agents")
      .select("*")
      .eq("id", params.id)
      .single();

    if (error || !data) {
      return NextResponse.json({ error: "Agent not found." }, { status: 404 });
    }
    return NextResponse.json({ agent: data });
  } catch {
    return NextResponse.json({ error: "Internal server error." }, { status: 500 });
  }
}

export async function PATCH(request: Request, { params }: Ctx) {
  try {
    const supabase = await createClient();
    const adminErr = await requireAdmin(supabase);
    if (adminErr) return adminErr;

    const body = await request.json();

    // Build update object from allowed fields only
    const updates: Record<string, unknown> = {};
    const allowed = [
      "name", "avatar_url", "system_prompt", "model_name", "model_credential_id",
      "personality_traits", "expertise_keywords", "writing_style",
      "is_active", "response_temperature", "max_context_messages",
    ];
    for (const key of allowed) {
      if (body[key] !== undefined) updates[key] = body[key];
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: "No valid fields to update." }, { status: 400 });
    }

    const { data, error } = await supabase
      .from("agents")
      .update(updates)
      .eq("id", params.id)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ agent: data });
  } catch {
    return NextResponse.json({ error: "Internal server error." }, { status: 500 });
  }
}

export async function DELETE(_req: Request, { params }: Ctx) {
  try {
    const supabase = await createClient();
    const adminErr = await requireAdmin(supabase);
    if (adminErr) return adminErr;

    const { error } = await supabase
      .from("agents")
      .delete()
      .eq("id", params.id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Internal server error." }, { status: 500 });
  }
}

