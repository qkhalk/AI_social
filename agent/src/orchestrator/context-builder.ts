import { Room, Agent, Message } from '../types';
import { DEFAULT_CONTEXT_MESSAGES } from '../config';
import { retrieveRelevantMemories } from '../services/memory-service';
import { getLatestSummary } from '../services/memory-service';
import { generateEmbedding } from '../services/embedding-service';

interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

const MEMORY_CHAR_BUDGET = 800; // Max chars for memory context block
const SUMMARY_CHAR_BUDGET = 600; // Max chars for conversation summary

/**
 * Build the full LLM context for an agent's turn.
 * Structure: system identity → memories → summary → room context → conversation history → instructions.
 * Memory and summary retrieval are async and best-effort — failures produce empty strings.
 */
export async function buildContext(
  room: Room,
  agent: Agent,
  recentMessages: Message[]
): Promise<ChatMessage[]> {
  const messages: ChatMessage[] = [];

  // System message: agent identity, personality, and writing style
  messages.push({
    role: 'system',
    content: buildSystemPrompt(agent),
  });

  // Relevant past memories: retrieved via embedding similarity, best-effort
  const memoryContext = await buildMemoryContext(agent.id, recentMessages);
  if (memoryContext) {
    messages.push({ role: 'system', content: memoryContext });
  }

  // Conversation summary: compressed history for long conversations
  const summaryContext = await buildSummaryContext(room.id, recentMessages.length);
  if (summaryContext) {
    messages.push({ role: 'system', content: summaryContext });
  }

  // Room context: what the conversation is about
  messages.push({
    role: 'system',
    content: buildRoomContext(room),
  });

  // Conversation history: most recent messages, truncated to agent's context limit
  const limit = agent.max_context_messages || DEFAULT_CONTEXT_MESSAGES;
  const history = recentMessages
    .slice(0, limit)
    .reverse(); // DB returns newest-first, LLM needs chronological order

  for (const msg of history) {
    messages.push(mapHistoryMessage(msg, agent));
  }

  // Final instruction: behavioral guardrails for response generation
  messages.push({
    role: 'system',
    content: buildFinalInstruction(agent),
  });

  return messages;
}

/**
 * Fetch relevant memories for this agent based on recent conversation content.
 * Uses the last message as the similarity query to find topically related memories.
 */
async function buildMemoryContext(agentId: string, recentMessages: Message[]): Promise<string> {
  try {
    if (recentMessages.length === 0) return '';

    const queryText = recentMessages[0].content;
    const queryEmbedding = await generateEmbedding(queryText);
    const memories = await retrieveRelevantMemories(agentId, queryEmbedding, 3);

    if (memories.length === 0) return '';

    const parts = memories.map(
      (m) => `[${m.memory_type}] ${m.content}`
    );
    const combined = parts.join('\n').slice(0, MEMORY_CHAR_BUDGET);

    return `Relevant past memories:\n${combined}`;
  } catch {
    return '';
  }
}

/**
 * Fetch conversation summary if the conversation is long enough.
 * Summaries let agents recall earlier topics without the full history.
 */
async function buildSummaryContext(roomId: string, messageCount: number): Promise<string> {
  try {
    if (messageCount < 30) return '';

    const summary = await getLatestSummary(roomId);
    if (!summary) return '';

    const text = summary.summary_text.slice(0, SUMMARY_CHAR_BUDGET);
    return `Previous conversation summary: ${text}`;
  } catch {
    return '';
  }
}

function buildSystemPrompt(agent: Agent): string {
  const traits = agent.personality_traits;
  const traitParts: string[] = [];
  if (traits) {
    for (const [key, value] of Object.entries(traits)) {
      if (key !== 'talkativeness') {
        traitParts.push(`${key}: ${value}`);
      }
    }
  }

  let prompt = `You are ${agent.name}. ${agent.system_prompt}`;
  if (agent.writing_style) {
    prompt += ` Writing style: ${agent.writing_style}.`;
  }
  if (traitParts.length > 0) {
    prompt += ` Personality traits: ${traitParts.join(', ')}.`;
  }
  return prompt;
}

function buildRoomContext(room: Room): string {
  const parts: string[] = [];
  if (room.topic) parts.push(`Room topic: ${room.topic}`);
  if (room.description) parts.push(`Room description: ${room.description}`);
  if (parts.length === 0) parts.push('Room topic: general conversation');
  return parts.join('. ') + '.';
}

/**
 * Map a DB message to an LLM chat message.
 * The current agent sees its own past messages as 'assistant',
 * all other messages as 'user' (to avoid role conflicts).
 */
function mapHistoryMessage(msg: Message, currentAgent: Agent): ChatMessage {
  const isOwnMessage = msg.agent_id === currentAgent.id;
  const content = isOwnMessage ? msg.content : msg.content;

  return {
    role: isOwnMessage ? 'assistant' : 'user',
    content,
  };
}

function buildFinalInstruction(agent: Agent): string {
  return (
    `Continue the conversation naturally as ${agent.name}. ` +
    'Keep responses concise (2-4 sentences). ' +
    'Respond in the same language as the conversation.'
  );
}
