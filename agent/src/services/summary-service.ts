import { callLLM } from './llm-client';
import { storeConversationSummary, getLatestSummary } from './memory-service';
import { Message } from '../types';

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
 * Generate a conversation summary using LLM and persist it.
 * Summaries compress the conversation history so agents maintain context
 * without needing the full message history in the prompt.
 */
export async function generateSummary(
  roomId: string,
  messages: Message[]
): Promise<string> {
  const messageText = messages
    .slice() // Don't mutate original
    .reverse() // Chronological order for LLM
    .map((m) => `${m.sender_type === 'system' ? 'System' : `Agent ${m.agent_id?.slice(0, 8)}`}: ${m.content}`)
    .join('\n');

  const summaryPrompt = [
    {
      role: 'system' as const,
      content:
        'Summarize the following conversation in 3-5 sentences. ' +
        'Focus on: key topics discussed, conclusions reached, and any disagreements. ' +
        'Be concise and factual.',
    },
    {
      role: 'user' as const,
      content: `Conversation:\n${messageText.slice(0, 6000)}`,
    },
  ];

  try {
    const response = await callLLM(
      'meta-llama/llama-4-scout:free',
      summaryPrompt,
      0.3, // Low temperature for factual summary
      300
    );

    const summaryText = response.content.trim();

    await storeConversationSummary(roomId, summaryText, messages.length);

    console.log(`[summary-service] Generated summary for room ${roomId} (${messages.length} messages)`);
    return summaryText;
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error(`[summary-service] Failed to generate summary: ${msg}`);
    return '';
  }
}
