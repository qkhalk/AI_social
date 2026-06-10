#!/usr/bin/env ts-node
/**
 * Seed Secrets Script
 *
 * Initializes the SQLite secrets store with configuration values.
 * Reads from environment variables, generates encryption key if missing.
 *
 * Usage:
 *   npx ts-node src/seed-secrets.ts
 *   ENCRYPTION_KEY=abc123... npx ts-node src/seed-secrets.ts
 */
import * as dotenv from 'dotenv';
import { resolve as pathResolve } from 'path';
import * as readline from 'readline';

dotenv.config();

import { initSecretsStore, setSecret, getSecret, closeSecretsStore } from './services/secrets-store';
import { generateEncryptionKey, isValidEncryptionKey } from './services/encryption-service';

const SECRETS_DB_PATH = process.env.SECRETS_DB_PATH || pathResolve(__dirname, '..', 'data', 'secrets.db');

/** Secret definitions: [sqliteKey, envVarName, description, required] */
const SECRET_DEFS: Array<[string, string, string, boolean]> = [
  ['supabase_url', 'SUPABASE_URL', 'Supabase project URL', true],
  ['supabase_service_role_key', 'SUPABASE_SERVICE_ROLE_KEY', 'Supabase service role key', true],
  ['openrouter_api_key', 'OPENROUTER_API_KEY', 'OpenRouter LLM API key', true],
  ['turnstile_secret_key', 'TURNSTILE_SECRET_KEY', 'Turnstile verification secret', false],
  ['app_url', 'APP_URL', 'Public app URL', false],
];

function prompt(question: string): Promise<string> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

async function main(): Promise<void> {
  console.log('=== AI Social Network — Secrets Seed ===\n');
  console.log(`Database path: ${SECRETS_DB_PATH}\n`);

  initSecretsStore(SECRETS_DB_PATH);

  // Seed standard secrets from env vars
  for (const [key, envVar, description, required] of SECRET_DEFS) {
    const existing = getSecret(key);
    if (existing) {
      console.log(`  [skip] ${key} — already set`);
      continue;
    }

    let value = process.env[envVar] || '';
    if (!value && required) {
      value = await prompt(`  Enter ${description} (${envVar}): `);
      if (!value) {
        console.log(`  [warn] Skipping required secret: ${key}`);
        continue;
      }
    } else if (!value) {
      console.log(`  [skip] ${key} — not set and optional`);
      continue;
    }

    setSecret(key, value);
    console.log(`  [set] ${key}`);
  }

  // Handle encryption key — auto-generate if not provided
  const existingKey = getSecret('encryption_key');
  if (existingKey) {
    console.log(`\n  [skip] encryption_key — already set`);
  } else {
    let encKey = process.env.ENCRYPTION_KEY || '';
    if (!encKey) {
      encKey = generateEncryptionKey();
      console.log(`\n  [generated] New AES-256 encryption key`);
    } else if (!isValidEncryptionKey(encKey)) {
      console.error(`\n  [error] ENCRYPTION_KEY must be 64 hex chars (32 bytes). Got ${encKey.length} chars.`);
      closeSecretsStore();
      process.exit(1);
    }

    setSecret('encryption_key', encKey);
    console.log(`  [set] encryption_key`);
  }

  // Summary
  console.log('\n=== Secrets Summary ===');
  const allSecrets = (() => {
    // Re-import getAllSecrets to show masked values
    const Database = require('better-sqlite3');
    const db = new Database(SECRETS_DB_PATH);
    const rows = db.prepare('SELECT key, value FROM secrets ORDER BY key').all() as { key: string; value: string }[];
    db.close();
    return rows.map((r) => ({
      key: r.key,
      masked: r.value.length <= 8 ? '****' : r.value.slice(0, 4) + '*'.repeat(r.value.length - 4),
    }));
  })();

  for (const s of allSecrets) {
    console.log(`  ${s.key}: ${s.masked}`);
  }

  closeSecretsStore();
  console.log('\nDone. Secrets stored in SQLite.');
}

main().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
