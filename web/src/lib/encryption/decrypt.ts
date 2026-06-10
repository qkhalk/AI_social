import { createDecipheriv } from "crypto";

/**
 * Decrypts a base64-encoded string encrypted with encrypt().
 * Expected format: base64(iv + authTag + ciphertext)
 */
export function decrypt(encryptedBase64: string, key: string): string {
  const keyBuffer = Buffer.from(key, "base64");
  if (keyBuffer.length !== 32) {
    throw new Error("Encryption key must be 32 bytes (256 bits) when base64 decoded");
  }

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
export function decryptJson<T extends Record<string, unknown>>(encryptedBase64: string, key: string): T {
  const plaintext = decrypt(encryptedBase64, key);
  return JSON.parse(plaintext) as T;
}

/**
 * Safe decrypt for client-side message decryption.
 * Returns original ciphertext on failure so messages remain visible.
 */
export async function safeDecryptMessage(
  encryptedContent: string,
  key: string
): Promise<string> {
  try {
    return decrypt(encryptedContent, key);
  } catch {
    return encryptedContent;
  }
}