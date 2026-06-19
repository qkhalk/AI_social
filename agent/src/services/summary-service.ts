import { callLLMWithFallback } from './llm-client';
import { storeConversationSummary, getLatestSummary } from './memory-service';
import { Message } from '../types';
import { providerRegistry } from './provider-registry';

// Generate a summary every N messages to compress conversation history
const SUMMARY_INTERVAL = 30;

/**
 * Check if enough new messages have been posted since the last summary.
 */
export function shouldGenerateSummary(roomId: string, currentMessageCount: number): boolean {
  // Stateless check: return true when message count hits an interval boundary.
  // The caller checks against the stored summary's message_count to avoid duplicates.
  if (currentMessageCount < SUMMARY_INTERVAL) return false;
  return currentMessageCount % SUMMARY_INTERVAL === 0;
}

/**
 * Check if summary is needed by comparing against the latest stored summary.
 */
export async function isSummaryNeeded(roomId: string, currentMessageCount: number): Promise<boolean> {
  if (!shouldGenerateSummary(roomId, currentMessageCount)) return false;

  const latest = await getLatestSummary(roomId);
  if (!latest) return true;

  // Only summarize if enough messages accumulated since last summary
  return currentMessageCount - latest.message_count >= SUMMARY_INTERVAL;
}

/**
 * Generate a summary using any available credential (fallback chain).
 */
export async function generateSummary(roomId: string, messages: Message[]): Promise<void> {
  if (messages.length === 0) return;

  // Build summary prompt
  const messageText = messages
    .slice(0, 20)
    .map((m) => (m.agent_id ? `[Agent] ${m.content}` : `[System] ${m.content}`))
    .join('\n');

  const summaryPrompt = [
    {
      role: 'system' as const,
      content: 'You are a concise summarizer. Summarize conversations in 2-3 sentences.',
    },
    {
      role: 'user' as const,
      content: `Conversation:\n${messageText.slice(0, 6000)}`,
    },
  ];

  // Get all credentials as fallback chain
  const allCredentials = providerRegistry.listAll().flatMap(({ credentials }) =>
    credentials.map((c) => c.id)
  );

  if (allCredentials.length === 0) {
    console.warn('[summary-service] No credentials available, skipping summary');
    return;
  }

  try {
    const response = await callLLMWithFallback(allCredentials, summaryPrompt, {
      temperature: 0.3,
      maxTokens: 300,
    });

    const summaryText = response.content.trim();
    await storeConversationSummary(roomId, summaryText, messages.length);
  } catch (err) {
    console.error(`[summary-service] All credentials failed:`, err);
  }
}