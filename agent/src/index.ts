/**
 * Agent Service Entry Point
 *
 * Starts the orchestrator loop that polls active rooms,
 * selects agents, calls LLMs, and inserts messages.
 */
import * as dotenv from 'dotenv';

// Load env vars before any other imports (some modules read env at import time)
dotenv.config();

// Import config first — validates required env vars, throws if missing
import './config';
import { verifySupabaseConnection } from './services/supabase-client';
import { startHealthServer } from './services/health-check';
import { OrchestratorLoop } from './orchestrator/orchestrator-loop';

async function main(): Promise<void> {
  console.log('[agent-service] Starting...');

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
