import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/admin/require-admin";

/**
 * GET /api/admin/credentials/[id]/health
 * Returns lock/cooldown status for a credential across all models.
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

    const { data: { user } } = await supabase.auth.getUser();

    // Fetch credential metadata
    const { data: credential, error: fetchError } = await supabase
      .from("model_credentials")
      .select("id, credential_name, priority, backoff_level, last_used_at, is_active, test_status")
      .eq("id", id)
      .eq("admin_id", user!.id)
      .single();

    if (fetchError || !credential) {
      return NextResponse.json({ error: "Credential not found." }, { status: 404 });
    }

    // Fetch active locks
    const { data: locks, error: locksError } = await supabase
      .from("credential_model_locks")
      .select("model_name, locked_until, error_type, error_message")
      .eq("credential_id", id)
      .gt("locked_until", new Date().toISOString())
      .order("locked_until", { ascending: true });

    if (locksError) {
      return NextResponse.json({ error: locksError.message }, { status: 500 });
    }

    return NextResponse.json({
      credential_id: credential.id,
      credential_name: credential.credential_name,
      priority: credential.priority,
      backoff_level: credential.backoff_level,
      last_used_at: credential.last_used_at,
      is_active: credential.is_active,
      test_status: credential.test_status,
      active_locks: locks || [],
    });
  } catch {
    return NextResponse.json({ error: "Internal server error." }, { status: 500 });
  }
}
