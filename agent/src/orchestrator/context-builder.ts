import { Room, Agent, Message } from '../types';
import { DEFAULT_CONTEXT_MESSAGES } from '../config';
import { retrieveRelevantMemories } from '../services/memory-service';
import { getLatestSummary } from '../services/memory-service';
import { generateEmbedding } from '../services/embedding-service';

interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

const MEMORY_TOKEN_BUDGET = 200; // ~800 chars at 4 chars/token
function memChars() { return MEMORY_TOKEN_BUDGET * 4; }
const SUMMARY_TOKEN_BUDGET = 150; // ~600 chars
function sumChars() { return SUMMARY_TOKEN_BUDGET * 4; }

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

  // 1) System message: agent identity, personality, writing style
  messages.push({ role: 'system', content: buildSystemPrompt(agent) });

  // 2) Final instruction ngay sau system prompt (LLM chú ý system đầu/cuối)
  messages.push({ role: 'system', content: buildFinalInstruction(agent) });

  // 3) Relevant past memories: best-effort
  const memoryContext = await buildMemoryContext(agent.id, recentMessages);
  if (memoryContext) {
    messages.push({ role: 'system', content: memoryContext });
  }

  // 4) Conversation summary: compressed history
  const summaryContext = await buildSummaryContext(room.id, recentMessages.length);
  if (summaryContext) {
    messages.push({ role: 'system', content: summaryContext });
  }

  // 5) Room context
  messages.push({ role: 'system', content: buildRoomContext(room) });

  // 6) Conversation history (newest-first -> chronological)
  const limit = agent.max_context_messages || DEFAULT_CONTEXT_MESSAGES;
  const history = recentMessages.slice(0, limit).reverse();
  for (const msg of history) {
    messages.push(mapHistoryMessage(msg, agent));
  }

  return messages;
}

/**
 * Fetch relevant memories for this agent based on recent conversation content.
 * Uses the last message as the similarity query to find topically related memories.
 */
async function buildMemoryContext(agentId: string, recentMessages: Message[]): Promise<string> {
  try {
    if (recentMessages.length === 0) return '';

    // Truncate query text để embedding model không bị reject (>8192 token)
    const queryText = recentMessages[0].content.slice(0, 2000);
    const queryEmbedding = await generateEmbedding(queryText);
    const memories = await retrieveRelevantMemories(agentId, queryEmbedding, 3);

    if (memories.length === 0) return '';

    const parts = memories.map(
      (m) => `[${m.memory_type}] ${m.content}`
    );
    const combined = parts.join('\n').slice(0, memChars());

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

    const text = summary.summary_text.slice(0, sumChars());
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
  // Tin nhắn của chính agent này -> role 'assistant'
  // Tin nhắn của agent khác hoặc user -> role 'user' (tránh role conflict trong LLM)
  const isOwnMessage = msg.agent_id === currentAgent.id;
  return {
    role: isOwnMessage ? 'assistant' : 'user',
    content: msg.content,
  };
}

function buildFinalInstruction(agent: Agent): string {
  return (
    `Continue the conversation naturally as ${agent.name}. ` +
    'Keep responses concise (2-4 sentences). ' +
    'Respond in the same language as the conversation.'
  );
}
