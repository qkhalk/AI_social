/**
 * Application Configuration
 *
 * Resolves settings from SQLite secrets store first,
 * falls back to environment variables, then throws if missing.
 *
 * IMPORTANT: initSecretsStore() must be called before importing
 * any module that reads from this config.
 */
import * as dotenv from 'dotenv';
import { getSecretOrEnv } from './services/secrets-store';

dotenv.config();

// Resolved configuration — populated after SQLite store is initialized
let _resolved = false;

// Cached config values
let _supabaseUrl = '';
let _supabaseServiceRoleKey = '';
let _openrouterApiKey = '';
let _encryptionKey = '';
let _appUrl = '';
let _turnstileSecretKey = '';

/**
 * Resolve all configuration values.
 * Call once after initSecretsStore() — before any other module reads config.
 */
export function resolveConfig(): void {
  _supabaseUrl = getSecretOrEnv('supabase_url', 'SUPABASE_URL');
  _supabaseServiceRoleKey = getSecretOrEnv('supabase_service_role_key', 'SUPABASE_SERVICE_ROLE_KEY');
  _openrouterApiKey = getSecretOrEnv('openrouter_api_key', 'OPENROUTER_API_KEY');
  _encryptionKey = getSecretOrEnv('encryption_key', 'ENCRYPTION_KEY');
  _appUrl = getSecretOrEnv('app_url', 'APP_URL') || 'http://localhost:3000';
  _turnstileSecretKey = getSecretOrEnv('turnstile_secret_key', 'TURNSTILE_SECRET_KEY') || '';

  _resolved = true;
  console.log('[config] All configuration resolved successfully');
}

/** Assert config has been resolved before allowing access */
function assertResolved(): void {
  if (!_resolved) {
    throw new Error(
      'Config not resolved. Call resolveConfig() after initSecretsStore() first.'
    );
  }
}

// Exported config values — accessed after resolveConfig()

export function getSupabaseUrl(): string {
  assertResolved();
  return _supabaseUrl;
}

export function getSupabaseServiceRoleKey(): string {
  assertResolved();
  return _supabaseServiceRoleKey;
}

export function getOpenrouterApiKey(): string {
  assertResolved();
  return _openrouterApiKey;
}

export function getEncryptionKey(): string {
  assertResolved();
  return _encryptionKey;
}

export function getAppUrl(): string {
  assertResolved();
  return _appUrl;
}

export function getTurnstileSecretKey(): string {
  assertResolved();
  return _turnstileSecretKey;
}

// Lazy config object — properties throw if accessed before resolveConfig().
// Other modules import these via: import { config } from '../config'; config.SUPABASE_URL
export const config = {
  get SUPABASE_URL() { return getSupabaseUrl(); },
  get SUPABASE_SERVICE_ROLE_KEY() { return getSupabaseServiceRoleKey(); },
  get OPENROUTER_API_KEY() { return getOpenrouterApiKey(); },
  get APP_URL() { return getAppUrl(); },
};

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
