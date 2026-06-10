/**
 * Client-side AES-256-GCM Decryption
 *
 * Decrypts message content received from Supabase Realtime.
 * Matches the format used by agent/src/services/encryption-service.ts:
 *   base64(iv):base64(ciphertext):base64(authTag)
 *
 * Uses Web Crypto API (available in all modern browsers and Edge Runtime).
 */

const ALGORITHM = 'AES-GCM';
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;

/**
 * Decrypt an AES-256-GCM encrypted message.
 * Key must be a 64-character hex string (32 bytes).
 */
export async function decryptMessage(
  encrypted: string,
  key: string
): Promise<string> {
  const parts = encrypted.split(':');
  if (parts.length !== 3) {
    throw new Error(
      `Invalid encrypted data format: expected 3 parts, got ${parts.length}`
    );
  }

  const [ivB64, ciphertext, authTagB64] = parts;

  const iv = base64ToBuffer(ivB64);
  const authTag = base64ToBuffer(authTagB64);
  const ciphertextBuf = base64ToBuffer(ciphertext);

  if (iv.byteLength !== IV_LENGTH) {
    throw new Error(`Invalid IV length: expected ${IV_LENGTH}, got ${iv.byteLength}`);
  }

  // Web Crypto requires authTag appended to ciphertext for AES-GCM
  const combined = new Uint8Array(ciphertextBuf.byteLength + authTag.byteLength);
  combined.set(new Uint8Array(ciphertextBuf), 0);
  combined.set(new Uint8Array(authTag), ciphertextBuf.byteLength);

  const cryptoKey = await importKey(key);

  const decrypted = await crypto.subtle.decrypt(
    { name: ALGORITHM, iv },
    cryptoKey,
    combined
  );

  return new TextDecoder().decode(decrypted);
}

/**
 * Decrypt message content with graceful fallback.
 * Returns raw content if decryption fails (e.g., pre-encryption messages).
 */
export async function safeDecryptMessage(
  content: string,
  key: string
): Promise<string> {
  try {
    return await decryptMessage(content, key);
  } catch {
    return content;
  }
}

/**
 * Import a hex-encoded AES key into Web Crypto Key object.
 */
async function importKey(hexKey: string): Promise<CryptoKey> {
  const keyBytes = hexToBuffer(hexKey);
  return crypto.subtle.importKey('raw', keyBytes, { name: ALGORITHM }, false, [
    'decrypt',
  ]);
}

/**
 * Convert a hex string to ArrayBuffer.
 */
function hexToBuffer(hex: string): ArrayBuffer {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16);
  }
  return bytes.buffer;
}

/**
 * Convert a base64 string to ArrayBuffer.
 */
function base64ToBuffer(b64: string): ArrayBuffer {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}
