import { createClient, SupabaseClient } from '@supabase/supabase-js';
import WebSocket from 'ws';
import { config } from '../config';

let clientInstance: SupabaseClient | null = null;

/**
 * Singleton Supabase client using SERVICE_ROLE_KEY.
 * Bypasses RLS — only for backend agent service.
 */
export function getSupabaseClient(): SupabaseClient {
  if (clientInstance) return clientInstance;

  clientInstance = createClient(config.SUPABASE_URL, config.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
    realtime: { transport: WebSocket as never },
  });

  return clientInstance;
}

/**
 * Verify Supabase connectivity by running a lightweight query.
 * Call once at startup to fail fast on misconfigured credentials.
 */
export async function verifySupabaseConnection(): Promise<void> {
  const client = getSupabaseClient();
  const { error } = await client.from('agents').select('id').limit(1);

  if (error) {
    throw new Error(
      `Supabase connection failed: ${error.message}. ` +
      'Verify SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.'
    );
  }
}
