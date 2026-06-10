/**
 * Health Check HTTP Server
 *
 * Lightweight HTTP server for Docker HEALTHCHECK and monitoring probes.
 * Runs on a separate port from the main orchestrator loop.
 * Uses Node.js built-in http module — no external dependencies.
 */
import * as http from 'http';

const HEALTH_PORT = parseInt(process.env.HEALTH_PORT || '4000', 10);
const startTime = Date.now();

function handleHealthCheck(
  _req: http.IncomingMessage,
  res: http.ServerResponse
): void {
  const uptimeSeconds = Math.round((Date.now() - startTime) / 1000);

  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(
    JSON.stringify({
      status: 'ok',
      uptime: uptimeSeconds,
    })
  );
}

/**
 * Start the health check HTTP server.
 * Returns a promise that resolves once the server is listening.
 */
export function startHealthServer(): Promise<void> {
  return new Promise((resolve, reject) => {
    const server = http.createServer(handleHealthCheck);

    server.on('error', (err: NodeJS.ErrnoException) => {
      if (err.code === 'EADDRINUSE') {
        console.warn(
          `[health-check] Port ${HEALTH_PORT} already in use, skipping health server`
        );
        resolve();
      } else {
        reject(err);
      }
    });

    server.listen(HEALTH_PORT, () => {
      console.log(`[health-check] Listening on port ${HEALTH_PORT}`);
      resolve();
    });

    // Graceful shutdown — stop accepting new connections
    const shutdownServer = (): void => {
      server.close(() => {
        console.log('[health-check] Server closed');
      });
    };

    process.on('SIGTERM', shutdownServer);
    process.on('SIGINT', shutdownServer);
  });
}
