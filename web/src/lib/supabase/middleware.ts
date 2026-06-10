import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Refreshes the Supabase session and enforces route protection.
 *
 * Uses getUser() (not getSession()) to validate the JWT against
 * Supabase Auth on every request — prevents forged-session attacks.
 *
 * Route protection matrix:
 *   /admin/*        -> authed + admin role required -> else /login
 *   /login, /signup -> redirect to / if already authed
 *   everything else -> public access
 */
export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return request.cookies.get(name)?.value;
        },
        set(name: string, value: string, options: CookieOptions) {
          request.cookies.set({ name, value, ...options });
          supabaseResponse = NextResponse.next({ request });
          supabaseResponse.cookies.set({ name, value, ...options });
        },
        remove(name: string, options: CookieOptions) {
          request.cookies.set({ name, value: "", ...options });
          supabaseResponse = NextResponse.next({ request });
          supabaseResponse.cookies.set({ name, value: "", ...options });
        },
      },
    }
  );

  // getUser() validates the JWT server-side (not just reads cookies)
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;

  // --- Admin routes: require auth + admin role ---
  if (pathname.startsWith("/admin")) {
    if (!user) {
      return NextResponse.redirect(new URL("/login", request.url));
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();

    if (!profile || profile.role !== "admin") {
      return NextResponse.redirect(new URL("/login", request.url));
    }
  }

  // --- Auth pages: redirect away if already logged in ---
  if ((pathname === "/login" || pathname === "/signup") && user) {
    return NextResponse.redirect(new URL("/", request.url));
  }

  return supabaseResponse;
}
