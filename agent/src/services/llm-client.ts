import OpenAI from 'openai';
import { OPENROUTER_API_KEY, APP_URL, DEFAULT_TEMPERATURE } from '../config';
import { LLMResponse } from '../types';
import { logOrchestratorAction } from './logging-service';

let clientInstance: OpenAI | null = null;

/**
 * Singleton OpenAI client pointed at OpenRouter API.
 * OpenRouter exposes an OpenAI-compatible endpoint.
 */
export function createOpenRouterClient(): OpenAI {
  if (clientInstance) return clientInstance;

  clientInstance = new OpenAI({
    baseURL: 'https://openrouter.ai/api/v1',
    apiKey: OPENROUTER_API_KEY,
    defaultHeaders: {
      'HTTP-Referer': APP_URL,
      'X-Title': 'AI Social Network',
    },
  });

  return clientInstance;
}

const MAX_RETRIES = 3;
const BASE_DELAY_MS = 1000;

/**
 * Call LLM with exponential backoff retry.
 * Returns parsed response with content and token usage.
 */
export async function callLLM(
  model: string,
  messages: Array<{ role: string; content: string }>,
  temperature: number = DEFAULT_TEMPERATURE,
  maxTokens: number = 500
): Promise<LLMResponse> {
  const client = createOpenRouterClient();

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const response = await client.chat.completions.create({
        model,
        messages: messages as OpenAI.ChatCompletionMessageParam[],
        temperature,
        max_tokens: maxTokens,
      });

      const choice = response.choices[0];
      if (!choice?.message?.content) {
        throw new Error('LLM returned empty response');
      }

      return {
        content: choice.message.content,
        usage: {
          prompt_tokens: response.usage?.prompt_tokens ?? 0,
          completion_tokens: response.usage?.completion_tokens ?? 0,
          total_tokens: response.usage?.total_tokens ?? 0,
        },
      };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      const delay = BASE_DELAY_MS * Math.pow(2, attempt - 1);

      await logOrchestratorAction(null, null, 'llm_error', {
        model,
        attempt,
        error: message,
      });

      if (attempt === MAX_RETRIES) {
        throw new Error(
          `LLM call failed after ${MAX_RETRIES} attempts: ${message}`
        );
      }

      // Exponential backoff: 1s, 2s, 4s
      await sleep(delay);
    }
  }

  // Unreachable but satisfies TypeScript
  throw new Error('LLM call failed unexpectedly');
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
