/**
 * Error classification for gateway credential failures.
 * Text patterns checked first (body scan), then HTTP status fallback.
 * Inspired by 9router's ERROR_RULES pattern.
 */

export interface ClassifiedError {
  type: "rate_limit" | "auth_error" | "server_error" | "connection_error" | "timeout" | "unknown";
  /** Base cooldown in seconds before this error type allows retry */
  baseCooldown: number;
}

interface ErrorRule {
  pattern?: RegExp;
  status?: number;
  type: ClassifiedError["type"];
  baseCooldown: number;
}

/** Rules evaluated top-to-bottom. First match wins. */
const ERROR_RULES: ErrorRule[] = [
  // Text patterns (checked first in error body)
  { pattern: /rate.?limit/i, type: "rate_limit", baseCooldown: 60 },
  { pattern: /quota/i, type: "rate_limit", baseCooldown: 120 },
  { pattern: /insufficient.?fund/i, type: "auth_error", baseCooldown: 300 },
  { pattern: /invalid.?api.?key/i, type: "auth_error", baseCooldown: 300 },
  { pattern: /unauthorized/i, type: "auth_error", baseCooldown: 300 },
  { pattern: /forbidden/i, type: "auth_error", baseCooldown: 300 },
  // HTTP status codes (fallback)
  { status: 429, type: "rate_limit", baseCooldown: 60 },
  { status: 401, type: "auth_error", baseCooldown: 300 },
  { status: 403, type: "auth_error", baseCooldown: 300 },
  { status: 500, type: "server_error", baseCooldown: 30 },
  { status: 502, type: "server_error", baseCooldown: 30 },
  { status: 503, type: "server_error", baseCooldown: 30 },
];

/**
 * Classify a provider error to determine lock type and cooldown.
 * Text patterns take priority over status codes.
 */
export function classifyError(error: {
  status?: number;
  body?: string;
}): ClassifiedError {
  // Check text patterns first
  if (error.body) {
    for (const rule of ERROR_RULES) {
      if (rule.pattern && rule.pattern.test(error.body)) {
        return { type: rule.type, baseCooldown: rule.baseCooldown };
      }
    }
  }

  // Then check HTTP status
  if (error.status) {
    for (const rule of ERROR_RULES) {
      if (rule.status === error.status) {
        return { type: rule.type, baseCooldown: rule.baseCooldown };
      }
    }
  }

  return { type: "unknown", baseCooldown: 15 };
}
