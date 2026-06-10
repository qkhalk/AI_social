import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * Shared admin role verification for API routes.
 * Returns an error response if user is not authenticated admin,
 * or null if the check passes (user is admin).
 */
export async function requireAdmin(
  supabase: Awaited<ReturnType<typeof createClient>>
) {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (!profile || profile.role !== "admin") {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  return null;
}

/** Create a supabase server client — convenience wrapper for admin routes. */
export async function createAdminClient() {
  return await createClient();
}
