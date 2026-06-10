import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { cookies } from "next/headers";

/**
 * Server-side Supabase client.
 * Reads auth cookies from the incoming request so RSCs and route handlers
 * can access the current session.
 *
 * `set` / `remove` use try/catch because Server Components run
 * in a read-only context where `cookies().set()` throws — that is
 * expected and handled by the middleware refresh flow instead.
 */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value;
        },
        set(name: string, value: string, options: CookieOptions) {
          try {
            cookieStore.set({ name, value, ...options });
          } catch {
            // Server Components cannot set cookies.
            // Middleware handles session refresh instead.
          }
        },
        remove(name: string, options: CookieOptions) {
          try {
            cookieStore.set({ name, value: "", ...options });
          } catch {
            // Server Components cannot set cookies.
            // Middleware handles session refresh instead.
          }
        },
      },
    }
  );
}
