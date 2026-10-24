import http from 'node:http';

/**
 * HTTP server limits that protect against connection-level attacks:
 * - slowloris (headers trickled in slowly): headersTimeout + frequent connection checks
 * - slow bodies holding sockets open: requestTimeout
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
