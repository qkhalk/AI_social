import { createBrowserClient } from "@supabase/ssr";

/**
 * Browser-side Supabase client.
 * Safe to call in client components and useEffect hooks.
 * Re-creates on every call to avoid stale token state.
 */
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
