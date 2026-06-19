/**
 * Agent Service
 *
 * Query agent với credential info join.
 * Cache in-memory để giảm DB load (orchestrator loop poll mỗi 3s).
 */

import { getSupabaseClient } from './supabase-client';

export interface AgentWithCredential {
  id: string;
  name: string;
  system_prompt: string;
  model_credential_id: string | null;
  response_temperature: number | null;
  max_context_messages: number | null;
  expertise_keywords: string[];
  personality_traits: Record<string, any>;
  writing_style: string | null;
  is_active: boolean;
  credential: {
    id: string;
    provider_name: string;
    credential_name: string;
    api_base_url: string | null;
  } | null;
}

const cache = new Map<string, { agent: AgentWithCredential; timestamp: number }>();
const CACHE_TTL_MS = 30_000; // 30 giây

/**
 * Lấy agent kèm credential info. Cache 30s.
 */
export async function fetchAgentWithCredential(agentId: string): Promise<AgentWithCredential | null> {
  // Check cache
  const cached = cache.get(agentId);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return cached.agent;
  }

  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from('agents')
    .select(`
      id, name, system_prompt, model_credential_id,
      response_temperature, max_context_messages,
      expertise_keywords, personality_traits, writing_style, is_active,
      model_credentials:model_credential_id (
        id,
        model_providers (name, api_base_url)
      )
    `)
    .eq('id', agentId)
    .single();

  if (error || !data) {
    console.error(`[agent-service] Failed to fetch agent ${agentId}:`, error?.message);
    return null;
  }

  const credentialJoin = (data as any).model_credentials;
  const providerJoin = credentialJoin?.model_providers;

  const agent: AgentWithCredential = {
    id: data.id,
    name: data.name,
    system_prompt: data.system_prompt,
    model_credential_id: data.model_credential_id,
    response_temperature: data.response_temperature,
    max_context_messages: data.max_context_messages,
    expertise_keywords: data.expertise_keywords ?? [],
    personality_traits: data.personality_traits ?? {},
    writing_style: data.writing_style,
    is_active: data.is_active,
    credential: credentialJoin
      ? {
          id: credentialJoin.id,
          provider_name: providerJoin?.name ?? 'unknown',
          credential_name: (credentialJoin as any).credential_name ?? '',
          api_base_url: providerJoin?.api_base_url ?? null,
        }
      : null,
  };

  cache.set(agentId, { agent, timestamp: Date.now() });
  return agent;
}

/**
 * Clear cache (gọi sau khi admin update agent config).
 */
export function clearAgentCache(agentId?: string): void {
  if (agentId) {
    cache.delete(agentId);
  } else {
    cache.clear();
  }
}