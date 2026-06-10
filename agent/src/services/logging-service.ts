import { getSupabaseClient } from './supabase-client';
import { TokenUsageEntry } from '../types';

/**
 * Log an orchestrator action to the orchestrator_logs table.
 * Every turn, LLM call, termination, and error gets logged for observability.
 */
export async function logOrchestratorAction(
  roomId: string | null,
  agentId: string | null,
  action: string,
  metadata: Record<string, unknown> = {}
): Promise<void> {
  try {
    const client = getSupabaseClient();
    await client.from('orchestrator_logs').insert({
      room_id: roomId,
      agent_id: agentId,
      action,
      metadata,
    });
  } catch (error: unknown) {
    // Logging must never crash the service — swallow and console
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[logging-service] Failed to log action "${action}": ${message}`);
  }
}

/**
 * Track token usage for a single LLM call.
 * Enables cost reporting and budget enforcement.
 */
export async function trackTokenUsage(entry: TokenUsageEntry): Promise<void> {
  try {
    const client = getSupabaseClient();
    await client.from('token_usage').insert({
      agent_id: entry.agent_id,
      room_id: entry.room_id,
      model_name: entry.model_name,
      prompt_tokens: entry.prompt_tokens,
      completion_tokens: entry.completion_tokens,
      total_tokens: entry.total_tokens,
      cost_usd: entry.cost_usd,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[logging-service] Failed to track token usage: ${message}`);
  }
}

// Cost per 1M tokens: [input, output] in USD
const MODEL_COSTS: Record<string, [number, number]> = {
  'meta-llama/llama-4-scout:free': [0, 0],
  'meta-llama/llama-4-scout': [0.2, 0.6],
  'openai/gpt-4o-mini': [0.15, 0.6],
  'openai/gpt-4o': [2.5, 10],
  'anthropic/claude-sonnet-4': [3, 15],
  'google/gemini-2.5-flash': [0.15, 0.6],
  'deepseek/deepseek-chat': [0.27, 1.1],
};

const DEFAULT_COST: [number, number] = [0.15, 0.6];

/**
 * Estimate USD cost for a single LLM call based on model pricing.
 * Falls back to $0.15/$0.60 for unknown models.
 */
export function estimateCost(
  modelName: string,
  promptTokens: number,
  completionTokens: number
): number {
  const [inputPerM, outputPerM] = MODEL_COSTS[modelName] ?? DEFAULT_COST;
  const inputCost = (promptTokens / 1_000_000) * inputPerM;
  const outputCost = (completionTokens / 1_000_000) * outputPerM;
  return inputCost + outputCost;
}
