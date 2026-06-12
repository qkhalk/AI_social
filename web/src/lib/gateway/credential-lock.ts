/**
 * Per-(credential, model) lock management for gateway routing.
 * Locks prevent re-using a failing credential for a specific model during cooldown.
 * A credential locked for "gpt-4o" can still serve "gpt-3.5-turbo".
 */

import { createServiceRoleClient } from "@/lib/supabase/service-role";

/**
 * Create or update a model lock on a credential after a provider error.
 * Upserts on (credential_id, model_name) unique constraint.
 */
export async function lockCredential(
  credentialId: string,
  modelName: string,
  errorType: string,
  errorMessage: string | null,
  cooldownSeconds: number
): Promise<void> {
  const supabase = createServiceRoleClient();
  const lockedUntil = new Date(Date.now() + cooldownSeconds * 1000).toISOString();

  // Sanitize error message to never contain API keys
  const sanitizedMessage = (errorMessage || "")
    .replace(/sk-[a-zA-Z0-9]{20,}/g, "sk-***")
    .substring(0, 500);

  await supabase
    .from("credential_model_locks")
    .upsert(
      {
        credential_id: credentialId,
        model_name: modelName,
        locked_until: lockedUntil,
        error_type: errorType,
        error_message: sanitizedMessage,
      },
      { onConflict: "credential_id,model_name" }
    );
}

/**
 * Remove a model lock on a credential after a successful request.
 */
export async function unlockCredential(
  credentialId: string,
  modelName: string
): Promise<void> {
  const supabase = createServiceRoleClient();
  await supabase
    .from("credential_model_locks")
    .delete()
    .eq("credential_id", credentialId)
    .eq("model_name", modelName);
}

/**
 * Get all currently-locked model names for a credential.
 * Only returns locks where locked_until is still in the future.
 */
export async function getLockedModels(credentialId: string): Promise<Set<string>> {
  const supabase = createServiceRoleClient();
  const { data } = await supabase
    .from("credential_model_locks")
    .select("model_name")
    .eq("credential_id", credentialId)
    .gt("locked_until", new Date().toISOString());

  return new Set((data || []).map((row) => row.model_name));
}
