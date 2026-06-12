import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/admin/require-admin";

/**
 * PATCH /api/admin/credentials/reorder
 * Body: { provider_id: string, ordering: Array<{ id: string, priority: number }> }
 * Atomically updates priority for all credentials in a provider.
 */
export async function PATCH(request: Request) {
  try {
    const supabase = await createClient();
    const adminCheck = await requireAdmin(supabase);
    if (adminCheck) return adminCheck;

    const { data: { user } } = await supabase.auth.getUser();
    const body = await request.json();

    if (!body.provider_id || typeof body.provider_id !== "string") {
      return NextResponse.json({ error: "provider_id is required." }, { status: 400 });
    }
    if (!Array.isArray(body.ordering) || body.ordering.length === 0) {
      return NextResponse.json({ error: "ordering array is required." }, { status: 400 });
    }

    for (const entry of body.ordering) {
      if (!entry.id || typeof entry.priority !== "number") {
        return NextResponse.json({ error: "Each ordering entry requires id and numeric priority." }, { status: 400 });
      }
    }

    const credentialIds = body.ordering.map((e: { id: string }) => e.id);
    const { data: existing, error: fetchError } = await supabase
      .from("model_credentials")
      .select("id")
      .eq("admin_id", user!.id)
      .eq("provider_id", body.provider_id)
      .in("id", credentialIds);

    if (fetchError) {
      return NextResponse.json({ error: fetchError.message }, { status: 500 });
    }
    if (!existing || existing.length !== credentialIds.length) {
      return NextResponse.json({ error: "One or more credentials not found in this provider." }, { status: 403 });
    }

    const updates = await Promise.all(
      body.ordering.map(async (entry: { id: string; priority: number }) => {
        const { error } = await supabase
          .from("model_credentials")
          .update({ priority: entry.priority })
          .eq("id", entry.id)
          .eq("admin_id", user!.id);
        return error;
      })
    );

    const firstError = updates.find((e) => e);
    if (firstError) {
      return NextResponse.json({ error: firstError.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, updated: body.ordering.length });
  } catch {
    return NextResponse.json({ error: "Internal server error." }, { status: 500 });
  }
}
