import { Room, Message, TerminationResult } from '../types';
import { ROOM_TOKEN_BUDGET, ROOM_MAX_DURATION_MS } from '../config';

// Jaccard similarity threshold: conversations above this are considered circular
const CONVERGENCE_THRESHOLD = 0.7;

// Patterns indicating the conversation has naturally reached a conclusion
const CONCLUSION_MARKERS = [
  'i think we\'ve covered',
  'in conclusion',
  'to summarize',
  'we agree',
  'we both agree',
  'it\'s been great discussing',
  'i think we\'re on the same page',
  'that about covers it',
  'anything else to add',
  'i don\'t have much more to say',
  'that\'s a wrap',
  'nice chatting',
  'glad we could agree',
  'great discussion',
  'thanks for the conversation',
  'let\'s wrap up',
  'final thought',
];

/**
 * 6-layer termination check evaluated before every agent turn.
 * Layers are ordered by certainty: hard limits first, heuristics last.
 * Layers 4-5 now use Jaccard similarity and keyword matching (no embeddings needed).
 */
export function checkTermination(
  room: Room,
  messageCount: number,
  totalTokensUsed: number,
  recentMessages: Message[] = []
): TerminationResult {
  // Layer 6: Admin override — external status change detected at tick boundary
  if (room.status !== 'active') {
    return {
      shouldStop: true,
      reason: `admin_override: room status changed to "${room.status}"`,
    };
  }

  // Layer 1: Hard cap — absolute message limit prevents infinite loops
  if (messageCount >= room.max_messages) {
    return {
      shouldStop: true,
      reason: `hard_cap: ${messageCount} messages reached max ${room.max_messages}`,
    };
  }

  // Layer 2: Token budget — cost safety net
  if (totalTokensUsed >= ROOM_TOKEN_BUDGET) {
    return {
      shouldStop: true,
      reason: `token_budget: ${totalTokensUsed} tokens used, budget is ${ROOM_TOKEN_BUDGET}`,
    };
  }

  // Layer 3: Wall clock — prevent stale conversations from running forever
  if (room.started_at) {
    const elapsed = Date.now() - new Date(room.started_at).getTime();
    if (elapsed >= ROOM_MAX_DURATION_MS) {
      const minutes = Math.round(elapsed / 60000);
      return {
        shouldStop: true,
        reason: `wall_clock: room running for ${minutes} minutes, limit is 30`,
      };
    }
  }

  // Layer 4: Convergence — detect circular conversation via Jaccard word overlap.
  // When recent messages share >70% of words, agents are repeating themselves.
  if (recentMessages.length >= 3) {
    const lastThree = recentMessages.slice(0, 3);
    if (isConverged(lastThree)) {
      return {
        shouldStop: true,
        reason: 'convergence: last 3 messages are highly similar, conversation is circular',
      };
    }
  }

  // Layer 5: Natural end — keyword detection for conclusion markers in the latest message.
  // Agents sometimes signal they are done without explicit termination.
  if (recentMessages.length >= 1) {
    const lastMsg = recentMessages[0].content.toLowerCase();
    if (CONCLUSION_MARKERS.some((marker) => lastMsg.includes(marker))) {
      return {
        shouldStop: true,
        reason: 'natural_end: last message contains conclusion marker',
      };
    }
  }

  return { shouldStop: false, reason: '' };
}

/**
 * Check if the last N messages are semantically redundant using Jaccard similarity.
 * Compares pairwise word sets — high overlap means the conversation is looping.
 */
function isConverged(messages: Message[]): boolean {
  if (messages.length < 2) return false;

  const wordSets = messages.map((m) => extractWords(m.content));

  // Compare each pair and check if all pairs exceed the threshold
  for (let i = 0; i < wordSets.length - 1; i++) {
    for (let j = i + 1; j < wordSets.length; j++) {
      const similarity = jaccardSimilarity(wordSets[i], wordSets[j]);
      if (similarity < CONVERGENCE_THRESHOLD) return false;
    }
  }
  return true;
}

/**
 * Extract lowercase word set from text, filtering out common stop words.
 */
function extractWords(text: string): Set<string> {
  const stopWords = new Set([
    'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
    'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
    'should', 'may', 'might', 'shall', 'can', 'to', 'of', 'in', 'for',
    'on', 'with', 'at', 'by', 'from', 'as', 'into', 'through', 'during',
    'before', 'after', 'and', 'but', 'or', 'nor', 'not', 'so', 'yet',
    'both', 'either', 'neither', 'each', 'every', 'all', 'any', 'few',
    'more', 'most', 'other', 'some', 'such', 'no', 'only', 'own', 'same',
    'than', 'too', 'very', 'just', 'because', 'if', 'that', 'this',
    'it', 'its', 'i', 'me', 'my', 'we', 'our', 'you', 'your', 'he',
    'she', 'they', 'them', 'what', 'which', 'who', 'when', 'where',
    'how', 'about', 'up', 'out', 'also', 'then',
  ]);

  const words = text.toLowerCase().match(/[a-z]+/g) || [];
  return new Set(words.filter((w) => w.length > 2 && !stopWords.has(w)));
}

/**
 * Jaccard similarity: |intersection| / |union|. Range [0, 1].
 * 1.0 = identical word sets, 0.0 = no shared words.
 */
function jaccardSimilarity(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 1.0;
  if (a.size === 0 || b.size === 0) return 0.0;

  let intersection = 0;
  for (const word of a) {
    if (b.has(word)) intersection++;
  }

  const union = a.size + b.size - intersection;
  return union === 0 ? 0 : intersection / union;
}
