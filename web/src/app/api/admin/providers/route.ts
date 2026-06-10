import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/admin/require-admin";

/**
 * GET /api/admin/providers — list all model providers
 * POST /api/admin/providers — create a new provider
 */
export async function GET() {
  try {
    const supabase = await createClient();
    const adminCheck = await requireAdmin(supabase);
    if (adminCheck) return adminCheck;

    const { data, error } = await supabase
      .from("model_providers")
      .select("*")
      .order("display_name", { ascending: true });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ providers: data });
  } catch {
    return NextResponse.json({ error: "Internal server error." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const adminCheck = await requireAdmin(supabase);
    if (adminCheck) return adminCheck;

    const body = await request.json();

    if (!body.name || typeof body.name !== "string") {
      return NextResponse.json({ error: "Provider name is required." }, { status: 400 });
    }
    if (!body.display_name || typeof body.display_name !== "string") {
      return NextResponse.json({ error: "Display name is required." }, { status: 400 });
    }

    const { data, error } = await supabase
      .from("model_providers")
      .insert({
        name: body.name,
        display_name: body.display_name,
        auth_type: body.auth_type || "api_key",
        api_base_url: body.api_base_url || null,
        icon_url: body.icon_url || null,
        config_schema: body.config_schema || {},
        is_active: body.is_active ?? true,
      })
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ provider: data }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Internal server error." }, { status: 500 });
  }
}
