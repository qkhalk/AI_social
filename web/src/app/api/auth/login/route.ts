import { NextRequest, NextResponse } from "next/server";
import { verifyTurnstile } from "@/lib/turnstile/verify-server";
import { createClient } from "@/lib/supabase/server";
import { adminOnlyLoginError, isAdminOnlyAuthMode, isAllowedAdminEmail } from "@/lib/auth/access-policy";

/**
 * POST /api/auth/login
 *
 * 1. Verify Turnstile token (bot protection)
 * 2. Authenticate via Supabase signInWithPassword
 * 3. Return user info on success
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { email: rawEmail, password, turnstileToken } = body;
    const email = rawEmail?.trim();

    if (!email || !password || !turnstileToken) {
      return NextResponse.json(
        { error: "Email, password, and Turnstile token are required." },
        { status: 400 }
      );
    }

    // Bot protection
    const isHuman = await verifyTurnstile(turnstileToken);
    if (!isHuman) {
      return NextResponse.json(
        { error: "Turnstile verification failed. Please try again." },
        { status: 403 }
      );
    }

    if (isAdminOnlyAuthMode() && !isAllowedAdminEmail(email)) {
      return NextResponse.json({ error: adminOnlyLoginError() }, { status: 403 });
    }

    const supabase = await createClient();

    const { data: authData, error: authError } =
      await supabase.auth.signInWithPassword({ email, password });

    if (authError) {
      return NextResponse.json({ error: authError.message }, { status: 401 });
    }

    return NextResponse.json(
      {
        message: "Logged in successfully.",
        user: { id: authData.user.id, email: authData.user.email },
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("Login error:", error);
    return NextResponse.json(
      { error: "An unexpected error occurred." },
      { status: 500 }
    );
  }
}
