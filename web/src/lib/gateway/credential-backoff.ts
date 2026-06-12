/**
 * Exponential backoff calculation and management for gateway credentials.
 * Formula: min(300, baseCooldown * 2^backoff_level)
 * Backoff level increments on consecutive failures, resets on success.
 */

import { createServiceRoleClient } from "@/lib/supabase/service-role";

const MAX_COOLDOWN_SECONDS = 300;

/**
 * Calculate cooldown duration based on base cooldown and current backoff level.
 */
export function calculateCooldown(baseCooldown: number, backoffLevel: number): number {
  return Math.min(MAX_COOLDOWN_SECONDS, baseCooldown * (2 ** backoffLevel));
}

/**
 * Read the current backoff level for a credential.
 */
async function getBackoffLevel(credentialId: string): Promise<number> {
  const supabase = createServiceRoleClient();
  const { data } = await supabase
    .from("model_credentials")
    .select("backoff_level")
    .eq("id", credentialId)
    .single();
  return data?.backoff_level ?? 0;
}

/**
 * Increment backoff level for a credential after a failure.
 */
export async function incrementBackoffLevel(credentialId: string): Promise<void> {
  const supabase = createServiceRoleClient();
  const current = await getBackoffLevel(credentialId);
  await supabase
    .from("model_credentials")
    .update({ backoff_level: current + 1 })
    .eq("id", credentialId);
}

/**
 * Reset backoff level to 0 after a successful request.
 */
export async function resetBackoffLevel(credentialId: string): Promise<void> {
  const supabase = createServiceRoleClient();
  await supabase
    .from("model_credentials")
    .update({ backoff_level: 0 })
    .eq("id", credentialId);
}
