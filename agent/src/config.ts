import * as dotenv from 'dotenv';

dotenv.config();

// Required env vars — service cannot start without these
const requiredEnvVars = [
  'SUPABASE_URL',
  'SUPABASE_SERVICE_ROLE_KEY',
  'OPENROUTER_API_KEY',
] as const;

function validateEnv(): void {
  const missing = requiredEnvVars.filter((key) => !process.env[key]);
  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variables: ${missing.join(', ')}. ` +
      'Check your .env file or container environment.'
    );
  }
}

// Validate at module load time — fails fast before any work begins
validateEnv();

export const SUPABASE_URL = process.env.SUPABASE_URL!;
export const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
export const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY!;
export const APP_URL = process.env.APP_URL || 'http://localhost:3000';

// Timing
export const POLL_INTERVAL_MS = 3000;
export const MIN_THINKING_DELAY_MS = 2000;
export const MAX_THINKING_DELAY_MS = 5000;

// Conversation defaults
export const DEFAULT_MAX_MESSAGES = 50;
export const DEFAULT_CONTEXT_MESSAGES = 20;
export const DEFAULT_TEMPERATURE = 0.8;
export const DEFAULT_MODEL = 'meta-llama/llama-4-scout:free';

// Token budget per room (safety net against runaway costs)
export const ROOM_TOKEN_BUDGET = 100_000;

// Wall clock limit per room conversation (30 minutes)
export const ROOM_MAX_DURATION_MS = 30 * 60 * 1000;
