/**
 * AES-256-GCM Encryption Service
 *
 * Provides authenticated encryption for message content stored in Supabase.
 * Uses Node.js built-in crypto module — no external dependencies.
 *
 * Output format: base64(iv):base64(ciphertext):base64(authTag)
 * - IV: 12 bytes random nonce (unique per encryption)
 * - AuthTag: 16 bytes GCM authentication tag (tamper detection)
 */
import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;

/**
 * Encrypt plaintext using AES-256-GCM.
 * Returns colon-separated base64 string: iv:ciphertext:authTag
 */
export function encrypt(plaintext: string, key: string): string {
  try {
    const iv = randomBytes(IV_LENGTH);
    const keyBuffer = Buffer.from(key, 'hex');

    if (keyBuffer.length !== 32) {
      throw new Error(
        `Invalid encryption key length: expected 32 bytes (64 hex chars), got ${keyBuffer.length}`
      );
    }

    const cipher = createCipheriv(ALGORITHM, keyBuffer, iv);
    let encrypted = cipher.update(plaintext, 'utf8', 'base64');
    encrypted += cipher.final('base64');
    const authTag = cipher.getAuthTag();

    return `${iv.toString('base64')}:${encrypted}:${authTag.toString('base64')}`;
  } catch (err) {
    throw new Error(
      `Encryption failed: ${err instanceof Error ? err.message : 'unknown error'}`
    );
  }
}

/**
 * Decrypt AES-256-GCM encrypted data.
 * Expects colon-separated base64 format: iv:ciphertext:authTag
 */
export function decrypt(encryptedData: string, key: string): string {
  try {
    const parts = encryptedData.split(':');
    if (parts.length !== 3) {
      throw new Error(
        `Invalid encrypted data format: expected 3 colon-separated parts, got ${parts.length}`
      );
    }

    const [ivB64, ciphertext, authTagB64] = parts;
    const iv = Buffer.from(ivB64, 'base64');
    const authTag = Buffer.from(authTagB64, 'base64');
    const keyBuffer = Buffer.from(key, 'hex');

    if (keyBuffer.length !== 32) {
      throw new Error(
        `Invalid encryption key length: expected 32 bytes, got ${keyBuffer.length}`
      );
    }

    if (iv.length !== IV_LENGTH) {
      throw new Error(
        `Invalid IV length: expected ${IV_LENGTH} bytes, got ${iv.length}`
      );
    }

    if (authTag.length !== AUTH_TAG_LENGTH) {
      throw new Error(
        `Invalid auth tag length: expected ${AUTH_TAG_LENGTH} bytes, got ${authTag.length}`
      );
    }

    const decipher = createDecipheriv(ALGORITHM, keyBuffer, iv);
    decipher.setAuthTag(authTag);
    let decrypted = decipher.update(ciphertext, 'base64', 'utf8');
    decrypted += decipher.final('utf8');

    return decrypted;
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
