import http from 'node:http';

/**
 * HTTP server limits that protect against connection-level attacks:
 * - slowloris (headers trickled in slowly): headersTimeout + frequent connection checks
 * - slow bodies holding sockets open: requestTimeout (sized to the largest upload, see requestTimeoutFor)
 * - idle keep-alive sockets piling up: keepAliveTimeout
 * - oversized headers: maxHeaderSize → 431
 */
export const SERVER_LIMITS = Object.freeze({
  headersTimeout: 15_000,
  requestTimeout: 30_000,
  keepAliveTimeout: 5_000,
  connectionsCheckingInterval: 2_000,
  maxHeaderSize: 16 * 1024,
  maxRequestsPerSocket: 1_000,
});

/**
 * Time allowed to receive a whole request: long enough for the largest image upload over a slow
 * 1 Mbit/s uplink (15 MB → 150 s), never under 30 s. Slow-header attacks are still cut at 15 s
 * (headersTimeout), and JSON bodies are capped at 100 kB, so this mostly matters for uploads.
 */
export function requestTimeoutFor(maxUploadMb) {
  const SLOW_UPLINK_MBIT = 1;
  return Math.max(SERVER_LIMITS.requestTimeout, Math.ceil((maxUploadMb * 8) / SLOW_UPLINK_MBIT) * 1000 + 30_000);
}

export function createHttpServer(app, overrides = {}) {
  const limits = { ...SERVER_LIMITS, ...overrides };
  const server = http.createServer(
    {
      maxHeaderSize: limits.maxHeaderSize,
      connectionsCheckingInterval: limits.connectionsCheckingInterval,
      requestTimeout: limits.requestTimeout,
      headersTimeout: limits.headersTimeout,
      // Reject requests with conflicting Content-Length/Transfer-Encoding (request smuggling).
      insecureHTTPParser: false,
    },
    app,
  );
  server.keepAliveTimeout = limits.keepAliveTimeout;
  server.maxRequestsPerSocket = limits.maxRequestsPerSocket;
  return server;
}
