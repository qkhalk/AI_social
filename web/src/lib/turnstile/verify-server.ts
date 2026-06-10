/**
 * Server-side Cloudflare Turnstile token verification.
 *
 * Called from API route handlers to prove the request came from a real
 * browser, not a bot. Uses the secret key (server-only, never exposed
 * to the client).
 */

interface TurnstileVerifyResponse {
  success: boolean;
  "error-codes"?: string[];
}

export async function verifyTurnstile(token: string): Promise<boolean> {
  const secretKey = process.env.TURNSTILE_SECRET_KEY;

  if (!secretKey) {
    console.error("TURNSTILE_SECRET_KEY is not configured");
    return false;
  }

  if (!token || token.trim().length === 0) {
    return false;
  }

  try {
    const response = await fetch(
      "https://challenges.cloudflare.com/turnstile/v0/siteverify",
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: `secret=${encodeURIComponent(secretKey)}&response=${encodeURIComponent(token)}`,
      }
    );

    if (!response.ok) {
      console.error("Turnstile verify HTTP error:", response.status);
      return false;
    }

    const data: TurnstileVerifyResponse = await response.json();

    if (!data.success && data["error-codes"]) {
      console.error("Turnstile verify failed:", data["error-codes"]);
    }

    return data.success;
  } catch (error) {
    console.error("Turnstile verify request failed:", error);
    return false;
  }
}
