import { createCipheriv, randomBytes } from "crypto";

/**
 * Encrypts a plaintext string using AES-256-GCM.
 * Returns a base64-encoded string containing: IV + AuthTag + Ciphertext
 * Format: base64(iv + authTag + ciphertext)
 */
export function encrypt(plaintext: string, key: string): string {
  const keyBuffer = Buffer.from(key, "base64");
  if (keyBuffer.length !== 32) {
    throw new Error("Encryption key must be 32 bytes (256 bits) when base64 decoded");
  }

  const iv = randomBytes(12); // 96-bit IV for GCM
  const cipher = createCipheriv("aes-256-gcm", keyBuffer, iv);

  const ciphertext = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);

  const authTag = cipher.getAuthTag();

  // Combine: IV (12) + AuthTag (16) + Ciphertext
  const combined = Buffer.concat([iv, authTag, ciphertext]);

  return combined.toString("base64");
}

/**
 * Encrypts a JSON object and returns base64 string.
 */
export function encryptJson<T extends Record<string, unknown>>(obj: T, key: string): string {
  return encrypt(JSON.stringify(obj), key);
}