/**
 * Server-side AES-256-GCM Decryption
 *
 * Used in Next.js server components to decrypt message content
 * before rendering. Uses Node.js crypto module (available in
 * server components but not client components).
 *
 * Format matches agent/src/services/encryption-service.ts:
 *   base64(iv):base64(ciphertext):base64(authTag)
 */
import { createDecipheriv } from "crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;

/**
 * Decrypt an AES-256-GCM encrypted string.
 * Key must be a 64-character hex string (32 bytes).
 */
export function decryptServer(encryptedData: string, key: string): string {
  const parts = encryptedData.split(":");
  if (parts.length !== 3) {
    throw new Error(
      `Invalid encrypted data format: expected 3 parts, got ${parts.length}`
    );
  }

  const [ivB64, ciphertext, authTagB64] = parts;
  const iv = Buffer.from(ivB64, "base64");
  const authTag = Buffer.from(authTagB64, "base64");
  const keyBuffer = Buffer.from(key, "hex");

  if (keyBuffer.length !== 32) {
    throw new Error(`Invalid key length: expected 32 bytes, got ${keyBuffer.length}`);
  }
  if (iv.length !== IV_LENGTH) {
    throw new Error(`Invalid IV length: expected ${IV_LENGTH}, got ${iv.length}`);
  }
  if (authTag.length !== AUTH_TAG_LENGTH) {
    throw new Error(`Invalid auth tag length: expected ${AUTH_TAG_LENGTH}, got ${authTag.length}`);
  }

  const decipher = createDecipheriv(ALGORITHM, keyBuffer, iv);
  decipher.setAuthTag(authTag);
  let decrypted = decipher.update(ciphertext, "base64", "utf8");
  decrypted += decipher.final("utf8");
  return decrypted;
}

/**
 * Safe decrypt — returns raw content on failure (graceful degradation
 * for messages stored before encryption was enabled).
 */
export function safeDecryptServer(content: string, key: string): string {
  try {
    return decryptServer(content, key);
  } catch {
    return content;
  }
}

/**
 * Decrypt message content for an array of messages in-place.
 */
export function decryptMessagesServer<T extends { content: string }>(
  messages: T[],
  key: string
): T[] {
  if (!key) return messages;
  return messages.map((msg) => ({
    ...msg,
    content: safeDecryptServer(msg.content, key),
  }));
}
