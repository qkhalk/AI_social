/**
 * Agent Service Entry Point
 *
 * Boot sequence:
 * 1. Load env vars (dotenv)
 * 2. Initialize SQLite secrets store
 * 3. Resolve configuration from SQLite/env
 * 4. Verify Supabase connection
 * 5. Start orchestrator loop
 */
import * as dotenv from 'dotenv';
import { resolve as pathResolve } from 'path';

// Load env vars before any other imports
dotenv.config();

// Initialize secrets store and resolve config BEFORE importing modules that read config
import { initSecretsStore, closeSecretsStore } from './services/secrets-store';
import { resolveConfig } from './config';

// Secrets DB path — use env var override or default to agent/data/secrets.db
const SECRETS_DB_PATH = process.env.SECRETS_DB_PATH || pathResolve(__dirname, '..', 'data', 'secrets.db');

// Boot: init store, resolve config, then import dependent modules
initSecretsStore(SECRETS_DB_PATH);
resolveConfig();

// NOW import modules that depend on config values
import { verifySupabaseConnection } from './services/supabase-client';
import { startHealthServer } from './services/health-check';
import { OrchestratorLoop } from './orchestrator/orchestrator-loop';

async function main(): Promise<void> {
  console.log('[agent-service] Starting...');
  console.log(`[agent-service] Secrets store: ${SECRETS_DB_PATH}`);

  // Start health check HTTP server for Docker probes (port 4000)
  await startHealthServer();

  // Verify database connectivity before entering the main loop
  await verifySupabaseConnection();
  console.log('[agent-service] Supabase connection verified');

  const orchestrator = new OrchestratorLoop();

  // Graceful shutdown: finish current turn, then exit
  const shutdown = async (signal: string): Promise<void> => {
    console.log(`[agent-service] Received ${signal}. Shutting down gracefully...`);
    orchestrator.stop();
    closeSecretsStore();

    // Give current turn a moment to finish before hard exit
    setTimeout(() => {
      console.log('[agent-service] Forced exit after timeout.');
      process.exit(0);
    }, 10000);
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));

  // Unhandled rejections should not silently kill the process
  process.on('unhandledRejection', (reason) => {
    console.error('[agent-service] Unhandled rejection:', reason);
  });

  console.log('[agent-service] Starting orchestrator loop...');
  await orchestrator.start();
  console.log('[agent-service] Shutdown complete.');
}

main().catch((error) => {
  console.error('[agent-service] Fatal startup error:', error);
  process.exit(1);
});
