import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * GET /auth/callback
 *
 * Supabase Auth redirects here after email confirmation or OAuth.
 * Exchanges the `code` query param for a session, then redirects
 * the user to the home page.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");

  if (!code) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  try {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (error) {
      console.error("Auth callback exchange error:", error.message);
      return NextResponse.redirect(new URL("/login", request.url));
    }
  } catch (error) {
    console.error("Auth callback error:", error);
    return NextResponse.redirect(new URL("/login", request.url));
  }

  return NextResponse.redirect(new URL("/", request.url));
}
