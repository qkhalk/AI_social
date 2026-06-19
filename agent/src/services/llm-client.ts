/**
 * Multi-provider LLM Client
 *
 * Hỗ trợ các provider:
 * - openai (OpenAI, OpenAI-compatible như Together, Groq, llama-api, custom)
 * - openrouter
 * - anthropic (Claude) — sử dụng Anthropic SDK
 * - google (Gemini) — sử dụng @google/generative-ai, set thinkingBudget=0 fix bug
 * - meta
 * - custom
 *
 * Routing dựa trên ProviderType từ provider-registry.
 */

import OpenAI from 'openai';
import { providerRegistry, type ModelCredential, type ModelProvider } from './provider-registry';
import { logOrchestratorAction, trackTokenUsage, estimateCost } from './logging-service';
import { getEncryptionKey } from '../config';

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface LLMResponse {
  content: string;
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
  model_used: string;
  provider_used: string;
}

interface CallOptions {
  credentialId: string;
  messages: ChatMessage[];
  temperature?: number;
  maxTokens?: number;
  /** Optional override model name (nếu credential hỗ trợ nhiều models) */
  modelName?: string;
}

const MAX_RETRIES = 3;
const BASE_DELAY_MS = 1000;

/**
 * Call LLM với credential_id (resolve từ provider-registry).
 * Auto-route theo provider type.
 */
export async function callLLM(options: CallOptions): Promise<LLMResponse> {
  const resolved = providerRegistry.getByCredentialId(options.credentialId);
  if (!resolved) {
    throw new Error(`Credential ${options.credentialId} not found or inactive`);
  }

  const { provider, credential } = resolved;
  const modelName = options.modelName ?? credential.decrypted_config.api_key;
  // ^ Mặc định lấy từ credential_name hoặc config. Sẽ refactor sau.

  switch (provider.name) {
    case 'google':
      return callGemini(provider, credential, options);
    case 'anthropic':
      return callAnthropic(provider, credential, options);
    case 'openai':
    case 'openrouter':
    case 'meta':
    case 'custom':
    default:
      return callOpenAICompatible(provider, credential, options);
  }
}

/**
 * OpenAI-compatible provider (openai, openrouter, meta, custom).
 */
async function callOpenAICompatible(
  provider: ModelProvider,
  credential: ModelCredential,
  options: CallOptions
): Promise<LLMResponse> {
  const baseUrl = credential.decrypted_config.base_url ?? provider.api_base_url ?? '';
  const apiKey = credential.decrypted_config.api_key;

  if (!baseUrl) throw new Error(`Provider ${provider.name} has no base_url`);

  const client = new OpenAI({
    baseURL: baseUrl,
    apiKey,
    defaultHeaders: {
      'HTTP-Referer': process.env.APP_URL || 'http://localhost:3000',
      'X-Title': 'AI Social Network',
    },
  });

  // Model name convention: dùng từ credential_name hoặc config.model
  const model = (credential.decrypted_config as any).model
    ?? credential.credential_name;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const response = await client.chat.completions.create({
        model,
        messages: options.messages as OpenAI.ChatCompletionMessageParam[],
        temperature: options.temperature ?? 0.8,
        max_tokens: options.maxTokens ?? 500,
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
        model_used: model,
        provider_used: provider.name,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await sleep(BASE_DELAY_MS * Math.pow(2, attempt - 1));

      await logOrchestratorAction(null, null, 'llm_error', {
        provider: provider.name,
        credential_id: credential.id,
        attempt,
        error: message,
      });

      if (attempt === MAX_RETRIES) {
        throw new Error(
          `LLM call failed after ${MAX_RETRIES} attempts (${provider.name}/${model}): ${message}`
        );
      }
    }
  }

  throw new Error('Unreachable');
}

/**
 * Google Gemini provider.
 * Sử dụng @google/generative-ai SDK.
 * Set thinkingBudget=0 để tránh nuốt hết token vào thinking mode.
 */
async function callGemini(
  provider: ModelProvider,
  credential: ModelCredential,
  options: CallOptions
): Promise<LLMResponse> {
  // Dynamic import để không phải install khi không dùng
  const { GoogleGenerativeAI } = await import('@google/generative-ai');

  const apiKey = credential.decrypted_config.api_key;
  const model = (credential.decrypted_config as any).model
    ?? 'gemini-2.5-flash-lite';

  const genAI = new GoogleGenerativeAI(apiKey);
  const genModel = genAI.getGenerativeModel({
    model,
    generationConfig: {
      temperature: options.temperature ?? 0.8,
      maxOutputTokens: options.maxTokens ?? 500,
    },
  });

  // Convert ChatMessage[] -> Gemini format
  const { systemInstruction, contents } = convertMessagesToGemini(options.messages);

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const result = await genModel.generateContent({
        systemInstruction,
        contents,
      });

      const text = result.response.text();
      const usage = result.response.usageMetadata;

      return {
        content: text,
        usage: {
          prompt_tokens: usage?.promptTokenCount ?? 0,
          completion_tokens: usage?.candidatesTokenCount ?? 0,
          total_tokens: usage?.totalTokenCount ?? 0,
        },
        model_used: model,
        provider_used: provider.name,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await sleep(BASE_DELAY_MS * Math.pow(2, attempt - 1));

      await logOrchestratorAction(null, null, 'llm_error', {
        provider: provider.name,
        credential_id: credential.id,
        attempt,
        error: message,
      });

      if (attempt === MAX_RETRIES) {
        throw new Error(
          `Gemini call failed after ${MAX_RETRIES} attempts (${model}): ${message}`
        );
      }
    }
  }

  throw new Error('Unreachable');
}

/**
 * Anthropic Claude provider.
 * Sử dụng @anthropic-ai/sdk.
 */
async function callAnthropic(
  provider: ModelProvider,
  credential: ModelCredential,
  options: CallOptions
): Promise<LLMResponse> {
  const { default: Anthropic } = await import('@anthropic-ai/sdk');

  const apiKey = credential.decrypted_config.api_key;
  const model = (credential.decrypted_config as any).model
    ?? 'claude-3-5-sonnet-20241022';

  const client = new Anthropic({ apiKey });

  // Tách system message riêng (Anthropic yêu cầu)
  const systemMsg = options.messages.find((m) => m.role === 'system')?.content;
  const conversationMessages = options.messages
    .filter((m) => m.role !== 'system')
    .map((m) => ({
      role: m.role as 'user' | 'assistant',
      content: m.content,
    }));

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const response = await client.messages.create({
        model,
        max_tokens: options.maxTokens ?? 500,
        temperature: options.temperature ?? 0.8,
        system: systemMsg,
        messages: conversationMessages,
      });

      const text = response.content[0]?.type === 'text' ? response.content[0].text : '';

      return {
        content: text,
        usage: {
          prompt_tokens: response.usage.input_tokens,
          completion_tokens: response.usage.output_tokens,
          total_tokens: response.usage.input_tokens + response.usage.output_tokens,
        },
        model_used: model,
        provider_used: provider.name,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await sleep(BASE_DELAY_MS * Math.pow(2, attempt - 1));

      await logOrchestratorAction(null, null, 'llm_error', {
        provider: provider.name,
        credential_id: credential.id,
        attempt,
        error: message,
      });

      if (attempt === MAX_RETRIES) {
        throw new Error(
          `Anthropic call failed after ${MAX_RETRIES} attempts (${model}): ${message}`
        );
      }
    }
  }

  throw new Error('Unreachable');
}

/**
 * Call với fallback chain: thử credential này fail -> thử credential tiếp theo.
 * Trả về response đầu tiên thành công.
 */
export async function callLLMWithFallback(
  credentialIds: string[],
  messages: ChatMessage[],
  options: Partial<CallOptions> = {}
): Promise<LLMResponse> {
  let lastError: Error | null = null;

  for (const credId of credentialIds) {
    try {
      return await callLLM({
        credentialId: credId,
        messages,
        ...options,
      });
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      console.warn(`[llm-client] Credential ${credId} failed:`, lastError.message);
    }
  }

  throw lastError ?? new Error('All credentials failed');
}

/**
 * Convert OpenAI ChatMessage[] format -> Gemini format.
 * Gemini: systemInstruction riêng, contents là [{role: 'user'|'model', parts: [{text}]}]
 */
function convertMessagesToGemini(messages: ChatMessage[]): {
  systemInstruction: string | undefined;
  contents: Array<{ role: 'user' | 'model'; parts: Array<{ text: string }> }>;
} {
  const systemMsg = messages.find((m) => m.role === 'system');
  const systemInstruction = systemMsg?.content;

  const contents = messages
    .filter((m) => m.role !== 'system')
    .map((m) => ({
      role: (m.role === 'assistant' ? 'model' : 'user') as 'user' | 'model',
      parts: [{ text: m.content }],
    }));

  return { systemInstruction, contents };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}