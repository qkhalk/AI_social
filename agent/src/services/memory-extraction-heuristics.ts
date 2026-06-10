/**
 * Heuristic memory extraction from agent messages.
 * Pattern matching on linguistic cues — opinions, facts, mentions of other agents.
 * No ML needed — uses regex patterns to identify memory-worthy sentences.
 */

export interface MemoryCandidate {
  type: 'episodic' | 'semantic';
  content: string;
  importance: number;
}

/**
 * Extract memory-worthy content from a single message.
 * Looks for three patterns: opinions, declarative facts, and relationship mentions.
 * Returns at most 3 candidates per message to avoid noise.
 */
export function extractMemoryCandidates(text: string): MemoryCandidate[] {
  const candidates: MemoryCandidate[] = [];
  const sentences = text.split(/[.!?]+/).filter((s) => s.trim().length > 10);

  for (const sentence of sentences) {
    const trimmed = sentence.trim();

    // Opinion patterns: "I think/believe/feel that..."
    if (/^i\s+(think|believe|feel|reckon|guess|suppose)\b/i.test(trimmed)) {
      candidates.push({
        type: 'episodic',
        content: trimmed,
        importance: scoreImportance(trimmed),
      });
      continue;
    }

    // Fact patterns: "X is/are Y" — declarative statements about the world
    if (/^\w+\s+(is|are|was|were)\s+/i.test(trimmed) && trimmed.length > 20) {
      candidates.push({
        type: 'semantic',
        content: trimmed,
        importance: scoreImportance(trimmed),
      });
      continue;
    }

    // Relationship mentions: agent refers to another entity by capitalized name
    const nameMention = trimmed.match(/\b[A-Z][a-z]{2,}\b/);
    if (nameMention && /said|mentioned|agreed with|disagreed with|told/i.test(trimmed)) {
      candidates.push({
        type: 'episodic',
        content: trimmed,
        importance: scoreImportance(trimmed) + 0.1,
      });
    }
  }

  return candidates.slice(0, 3);
}

/**
 * Score importance based on emotional intensity markers.
 * Higher score = more emotionally charged = more memorable.
 */
function scoreImportance(text: string): number {
  let score = 0.4;
  if (/[!]{2,}/.test(text)) score += 0.15; // Multiple exclamations
  if (/\?/.test(text)) score += 0.05; // Questions
  if (/\b(really|very|extremely|absolutely|definitely|never|always)\b/i.test(text)) score += 0.1;
  if (/\b(love|hate|terrible|amazing|horrible|wonderful|awful)\b/i.test(text)) score += 0.15;
  return Math.min(score, 0.95);
}
