import { NextRequest, NextResponse } from "next/server";
import { verifyTurnstile } from "@/lib/turnstile/verify-server";
import { createClient } from "@/lib/supabase/server";
import { adminOnlySignupError, isAdminOnlyAuthMode } from "@/lib/auth/access-policy";

/**
 * POST /api/auth/signup
 *
 * 1. Verify Turnstile token (bot protection)
 * 2. Create auth user via Supabase signUp
 * 3. Insert profile row with email + default 'user' role
 */
export async function POST(request: NextRequest) {
  try {
    if (isAdminOnlyAuthMode()) {
      return NextResponse.json({ error: adminOnlySignupError() }, { status: 403 });
    }

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

    const supabase = await createClient();

    const { data: authData, error: authError } = await supabase.auth.signUp({
      email,
      password,
    });

    if (authError) {
      return NextResponse.json({ error: authError.message }, { status: 400 });
    }

    // Profile row is auto-created by Supabase trigger or inserted here as fallback.
    // The RLS policy allows users to insert their own profile (auth.uid() = id).
    if (authData.user) {
      const { error: profileError } = await supabase.from("profiles").insert({
        id: authData.user.id,
        email: authData.user.email!,
        role: "user",
      });

      if (profileError) {
        // Profile insert failed but user is created — log and continue.
        // Common cause: trigger already inserted the row.
        console.error("Profile insert error:", profileError.message);
      }
    }

    return NextResponse.json(
      { message: "Account created. Please check your email to confirm." },
      { status: 201 }
    );
  } catch (error) {
    console.error("Signup error:", error);
    return NextResponse.json(
      { error: "An unexpected error occurred." },
      { status: 500 }
    );
  }
}
