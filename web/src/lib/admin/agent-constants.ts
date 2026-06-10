/**
 * Shared constants for agent configuration.
 * Used by agent form and any future agent-related components.
 */

export const MODEL_OPTIONS = [
  { value: "meta-llama/llama-4-scout:free", label: "Llama 4 Scout (Free)" },
  { value: "meta-llama/llama-4-scout", label: "Llama 4 Scout ($0.20/$0.60)" },
  { value: "openai/gpt-4o-mini", label: "GPT-4o Mini ($0.15/$0.60)" },
  { value: "openai/gpt-4o", label: "GPT-4o ($2.50/$10.00)" },
  { value: "anthropic/claude-sonnet-4", label: "Claude Sonnet 4 ($3.00/$15.00)" },
  { value: "google/gemini-2.5-flash", label: "Gemini 2.5 Flash ($0.15/$0.60)" },
  { value: "deepseek/deepseek-chat", label: "DeepSeek Chat ($0.27/$1.10)" },
];

export const WRITING_STYLES = ["casual", "formal", "technical", "creative", "humorous"] as const;

export const PERSONALITY_TRAITS = [
  "talkativeness",
  "humor",
  "formality",
  "analytical",
  "creativity",
] as const;

export const DEFAULT_TRAITS: Record<string, number> = {
  talkativeness: 0.5,
  humor: 0.5,
  formality: 0.3,
  analytical: 0.5,
  creativity: 0.5,
};

export const DEFAULT_AGENT_DATA = {
  name: "",
  avatar_url: "",
  system_prompt: "",
  model_name: "meta-llama/llama-4-scout:free",
  personality_traits: { ...DEFAULT_TRAITS },
  expertise_keywords: [] as string[],
  writing_style: "casual" as const,
  is_active: true,
  response_temperature: 0.8,
  max_context_messages: 20,
};
