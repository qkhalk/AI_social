import { createDecipheriv } from "crypto";

/**
 * Server-side only decryption utility.
 * Uses ENCRYPTION_KEY from environment variables.
 * This file should only be imported in server components and API routes.
 */

function getEncryptionKey(): Buffer {
  const key = process.env.ENCRYPTION_KEY;
  if (!key) {
    throw new Error("ENCRYPTION_KEY environment variable is not set");
  }
  const keyBuffer = Buffer.from(key, "base64");
  if (keyBuffer.length !== 32) {
    throw new Error("ENCRYPTION_KEY must be 32 bytes (256 bits) when base64 decoded");
  }
  return keyBuffer;
}

/**
 * Decrypts a base64-encoded string encrypted with encrypt().
 * Expected format: base64(iv + authTag + ciphertext)
 */
export function decryptServer(encryptedBase64: string): string {
  const keyBuffer = getEncryptionKey();
  const combined = Buffer.from(encryptedBase64, "base64");

  // Extract components: IV (12) + AuthTag (16) + Ciphertext (rest)
  const iv = combined.subarray(0, 12);
  const authTag = combined.subarray(12, 28);
  const ciphertext = combined.subarray(28);

  const decipher = createDecipheriv("aes-256-gcm", keyBuffer, iv);
  decipher.setAuthTag(authTag);

  const plaintext = Buffer.concat([
    decipher.update(ciphertext),
    decipher.final(),
  ]);

  return plaintext.toString("utf8");
}

/**
 * Decrypts and parses JSON.
 */
export function decryptJsonServer<T extends Record<string, unknown>>(encryptedBase64: string): T {
  const plaintext = decryptServer(encryptedBase64);
  return JSON.parse(plaintext) as T;
}

/**
 * Decrypts model credential config for use in API calls.
 * Returns the decrypted config object with api_key, base_url, etc.
 */
export function decryptModelCredential(encryptedConfig: string): {
  api_key?: string;
  organization_id?: string;
  base_url?: string;
  [key: string]: string | undefined;
} {
  return decryptJsonServer(encryptedConfig);
}

/**
 * Safe wrapper around decryptServer — returns null instead of throwing.
 * Useful in data-fetching contexts where one bad record shouldn't crash the page.
 */
export function safeDecryptServer(encryptedBase64: string): string | null {
  try {
    return decryptServer(encryptedBase64);
  } catch {
    return null;
  }
}

/**
 * Batch-decrypt an array of messages with a `content` field.
 * Falls back to original content on decryption failure.
 */
export function decryptMessagesServer<T extends { content: string }>(
  messages: T[],
  _key?: string
): T[] {
  return messages.map((msg) => {
    try {
      return { ...msg, content: decryptServer(msg.content) };
    } catch {
      return msg;
    }
  });
}