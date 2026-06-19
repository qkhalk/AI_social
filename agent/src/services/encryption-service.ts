/**
 * AES-256-GCM Encryption Service
 *
 * Provides authenticated encryption for message content stored in Supabase.
 * Uses Node.js built-in crypto module — no external dependencies.
 *
 * Output format: base64(iv + authTag + ciphertext)
 * - IV: 12 bytes random nonce (unique per encryption)
 * - AuthTag: 16 bytes GCM authentication tag (tamper detection)
 *
 * IMPORTANT: Must stay compatible with web/src/lib/encryption/encrypt.ts +
 * web/src/lib/encryption/decrypt-server.ts (Next.js side) so agent can read
 * credentials encrypted by web admin UI.
 */
import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;

export function encrypt(plaintext: string, key: string): string {
  try {
    const keyBuffer = Buffer.from(key, 'hex');
    if (keyBuffer.length !== 32) {
      throw new Error(
        `Invalid encryption key length: expected 32 bytes (64 hex chars), got ${keyBuffer.length}`
      );
    }

    const iv = randomBytes(IV_LENGTH);
    const cipher = createCipheriv(ALGORITHM, keyBuffer, iv);
    let ciphertext = cipher.update(plaintext, 'utf8');
    ciphertext = Buffer.concat([ciphertext, cipher.final()]);
    const authTag = cipher.getAuthTag();

    // Combined base64: IV (12) + AuthTag (16) + Ciphertext
    return Buffer.concat([iv, authTag, ciphertext]).toString('base64');
  } catch (err) {
    throw new Error(
      `Encryption failed: ${err instanceof Error ? err.message : 'unknown error'}`
    );
  }
}

export function decrypt(encryptedData: string, key: string): string {
  try {
    const keyBuffer = Buffer.from(key, 'hex');
    if (keyBuffer.length !== 32) {
      throw new Error(
        `Invalid encryption key length: expected 32 bytes (64 hex chars), got ${keyBuffer.length}`
      );
    }

    let combined: Buffer;
    let iv: Buffer;
    let authTag: Buffer;
    let ciphertext: Buffer;

    if (encryptedData.includes(':')) {
      // Legacy colon-separated format: iv:ciphertext:authTag (base64 each)
      const parts = encryptedData.split(':');
      if (parts.length !== 3) {
        throw new Error(
          `Invalid encrypted data format: expected 3 colon-separated parts or combined base64, got ${parts.length} parts`
        );
      }
      iv = Buffer.from(parts[0], 'base64');
      ciphertext = Buffer.from(parts[1], 'base64');
      authTag = Buffer.from(parts[2], 'base64');
    } else {
      // Modern combined format: base64(iv + authTag + ciphertext)
      combined = Buffer.from(encryptedData, 'base64');
      if (combined.length < IV_LENGTH + AUTH_TAG_LENGTH) {
        throw new Error(
          `Invalid combined encrypted data: length ${combined.length} < ${IV_LENGTH + AUTH_TAG_LENGTH}`
        );
      }
      iv = combined.subarray(0, IV_LENGTH);
      authTag = combined.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
      ciphertext = combined.subarray(IV_LENGTH + AUTH_TAG_LENGTH);
    }

    if (iv.length !== IV_LENGTH) {
      throw new Error(`Invalid IV length: expected ${IV_LENGTH} bytes, got ${iv.length}`);
    }
    if (authTag.length !== AUTH_TAG_LENGTH) {
      throw new Error(`Invalid auth tag length: expected ${AUTH_TAG_LENGTH} bytes, got ${authTag.length}`);
    }

    const decipher = createDecipheriv(ALGORITHM, keyBuffer, iv);
    decipher.setAuthTag(authTag);
    const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);

    return decrypted.toString('utf8');
  } catch (err) {
    throw new Error(
      `Decryption failed: ${err instanceof Error ? err.message : 'unknown error'}`
    );
  }
}

/**
 * Generate a random 32-byte encryption key as hex string (64 characters).
 * Used to bootstrap the encryption key on first run.
 */
export function generateEncryptionKey(): string {
  return randomBytes(32).toString('hex');
}

/**
 * Validate that a hex string is a valid 32-byte AES-256 key.
 */
export function isValidEncryptionKey(key: string): boolean {
  if (key.length !== 64) return false;
  return /^[0-9a-fA-F]{64}$/.test(key);
}