import OpenAI from 'openai';
import { config } from '../config';

const EMBEDDING_DIMENSIONS = 1536;

/**
 * Deterministic hash-based pseudo-vector for development.
 * Produces a consistent vector from text content without requiring an embedding API.
 * Not semantically meaningful — only useful as a placeholder when no API key exists.
 */
function pseudoEmbedding(text: string, dimensions: number = EMBEDDING_DIMENSIONS): number[] {
  const hash = text.split('').reduce((acc, char) => ((acc << 5) - acc + char.charCodeAt(0)) | 0, 0);
  return Array.from({ length: dimensions }, (_, i) => {
    const seed = hash * (i + 1);
    return Math.sin(seed) * 0.5;
  });
}

/**
 * Try generating an embedding via OpenRouter's OpenAI-compatible endpoint.
 * Falls back to pseudo-embedding if the API call fails or is unavailable.
 */
export async function generateEmbedding(text: string): Promise<number[]> {
  try {
    const client = new OpenAI({
      baseURL: 'https://openrouter.ai/api/v1',
      apiKey: config.OPENROUTER_API_KEY,
      defaultHeaders: {
        'HTTP-Referer': config.APP_URL,
        'X-Title': 'AI Social Network',
      },
    });

    const response = await client.embeddings.create({
      model: 'openai/text-embedding-3-small',
      input: text.slice(0, 8000), // Truncate to avoid token limits
    });

    return response.data[0].embedding;
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    console.warn(`[embedding-service] API embedding failed, using pseudo-embedding: ${msg}`);
    return pseudoEmbedding(text);
  }
}

/**
 * Batch embedding — generates embeddings for multiple texts concurrently.
 * Falls back individually so one failure does not block the rest.
 */
export async function generateEmbeddings(texts: string[]): Promise<number[][]> {
  const results = await Promise.all(texts.map((text) => generateEmbedding(text)));
  return results;
}
