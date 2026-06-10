import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/admin/require-admin";

/**
 * GET /api/admin/agents — list all agents
 * POST /api/admin/agents — create a new agent
 */
export async function GET() {
  try {
    const supabase = await createClient();

    // Verify admin role
    const adminCheck = await requireAdmin(supabase);
    if (adminCheck) return adminCheck;

    const { data, error } = await supabase
      .from("agents")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ agents: data });
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
    const validationError = validateAgentInput(body);
    if (validationError) return validationError;

    const { data, error } = await supabase
      .from("agents")
      .insert({
        name: body.name,
        avatar_url: body.avatar_url || null,
        system_prompt: body.system_prompt,
        model_name: body.model_name || "meta-llama/llama-4-scout:free",
        model_credential_id: body.model_credential_id || null,
        personality_traits: body.personality_traits || {},
        expertise_keywords: body.expertise_keywords || [],
        writing_style: body.writing_style || "casual",
        is_active: body.is_active ?? true,
        response_temperature: body.response_temperature ?? 0.8,
        max_context_messages: body.max_context_messages ?? 20,
      })
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ agent: data }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Internal server error." }, { status: 500 });
  }
}

function validateAgentInput(body: Record<string, unknown>) {
  if (!body.name || typeof body.name !== "string") {
    return NextResponse.json({ error: "Name is required." }, { status: 400 });
  }
  if (!body.system_prompt || typeof body.system_prompt !== "string") {
    return NextResponse.json({ error: "System prompt is required." }, { status: 400 });
  }
  return null;
}
