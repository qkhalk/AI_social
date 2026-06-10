/**
 * SQLite Secrets Store
 *
 * Local SQLite database for storing sensitive configuration (API keys, tokens).
 * Uses better-sqlite3 for synchronous, file-based storage.
 *
 * Resolution priority: SQLite → env var → throw error
 */
import Database from 'better-sqlite3';
import { mkdirSync, existsSync } from 'fs';
import { dirname, resolve } from 'path';

let db: Database | null = null;

/**
 * Initialize the SQLite secrets store.
 * Creates the database file and secrets table if they don't exist.
 * Auto-creates parent directories as needed.
 */
export function initSecretsStore(dbPath: string): void {
  const resolvedPath = resolve(dbPath);
  const dir = dirname(resolvedPath);

  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }

  db = new Database(resolvedPath);

  // Enable WAL mode for better concurrent read performance
  db.pragma('journal_mode = WAL');

  db.exec(`
    CREATE TABLE IF NOT EXISTS secrets (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now'))
    )
  `);
}

/**
 * Get a secret value by key from SQLite.
 * Returns null if the key does not exist.
 */
export function getSecret(key: string): string | null {
  if (!db) {
    throw new Error('Secrets store not initialized. Call initSecretsStore() first.');
  }

  const row = db.prepare('SELECT value FROM secrets WHERE key = ?').get(key) as
    | { value: string }
    | undefined;

  return row?.value ?? null;
}

/**
 * Set (upsert) a secret value by key.
 */
export function setSecret(key: string, value: string): void {
  if (!db) {
    throw new Error('Secrets store not initialized. Call initSecretsStore() first.');
  }

  db.prepare(
    `INSERT INTO secrets (key, value) VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`
  ).run(key, value);
}

/**
 * Delete a secret by key.
 */
export function deleteSecret(key: string): void {
  if (!db) {
    throw new Error('Secrets store not initialized. Call initSecretsStore() first.');
  }

  db.prepare('DELETE FROM secrets WHERE key = ?').run(key);
}

/**
 * Get all secrets with values masked for admin display.
 * Shows first 4 chars and masks the rest with asterisks.
 */
export function getAllSecrets(): { key: string; value: string }[] {
  if (!db) {
    throw new Error('Secrets store not initialized. Call initSecretsStore() first.');
  }

  const rows = db.prepare('SELECT key, value FROM secrets ORDER BY key').all() as {
    key: string;
    value: string;
  }[];

  return rows.map((row) => ({
    key: row.key,
    value: maskValue(row.value),
  }));
}

/**
 * Close the database connection. Call on graceful shutdown.
 */
export function closeSecretsStore(): void {
  if (db) {
    db.close();
    db = null;
  }
}

/**
 * Resolve a configuration value with fallback chain:
 * 1. SQLite secrets store (if initialized)
 * 2. Environment variable
 * 3. Throws descriptive error
 */
export function getSecretOrEnv(key: string, envVarName: string): string {
  // Try SQLite first
  const secret = getSecret(key);
  if (secret) return secret;

  // Fallback to env var
  const envValue = process.env[envVarName];
  if (envValue) return envValue;

  throw new Error(
    `Configuration '${key}' not found in SQLite secrets store ` +
    `and env var '${envVarName}' is not set. ` +
    `Run 'npx ts-node src/seed-secrets.ts' to initialize secrets.`
  );
}

/**
 * Mask a value for safe display: show first 4 chars, mask the rest.
 */
function maskValue(value: string): string {
  if (value.length <= 8) return '****';
  return value.slice(0, 4) + '*'.repeat(value.length - 4);
}
