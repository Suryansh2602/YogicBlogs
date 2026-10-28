import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import { env } from './config/env.js';
import { isRedisEnabled } from './config/redis.js';
import { createApiLimiter, createRedisStore } from './middlewares/rateLimiter.js';
import { errorHandler, notFound } from './middlewares/errorHandler.js';
import routes from './routes.js';

/**
 * @param {object} [options]
 * @param {boolean} [options.redisRateLimit] Use the Redis store for rate limits
 *   (default: on when Redis is enabled, outside tests; otherwise an in-memory store).
 * @param {number} [options.apiRateLimit] Override the per-IP request limit. Only for load tests that
 *   measure raw capacity; never set in the running server.
 */
export function createApp({ redisRateLimit = !env.isTest && isRedisEnabled(), apiRateLimit } = {}) {
  const app = express();

  app.disable('x-powered-by');
  // Behind a reverse proxy in production, so rate limiting sees the real client IP.
  if (env.isProduction) app.set('trust proxy', 1);

  app.use(helmet());
  // Limit before parsing bodies, and on every path, so floods and route scans are throttled too.
  app.use(createApiLimiter(redisRateLimit ? createRedisStore('api') : undefined, apiRateLimit));
  // The frontend is a separate app on its own origin: only origins on the allow-list may call the API.
  // Unknown origins get no CORS headers at all (not even Allow-Credentials).
  const allowedOrigins = new Set(env.CLIENT_ORIGIN);
  app.use(
    cors((req, callback) => {
      const allowed = allowedOrigins.has(req.header('Origin'));
      callback(
        null,
        allowed
          ? {
              origin: true,
              credentials: true,
              methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
              allowedHeaders: ['Content-Type', 'Authorization', 'X-CSRF-Token'],
              maxAge: 600,
            }
          : { origin: false },
      );
    }),
  );
  app.use(express.json({ limit: '100kb' }));
  app.use(express.urlencoded({ extended: false, limit: '100kb' }));

  app.use('/api/v1', routes);

  app.use(notFound);
  app.use(errorHandler);

  return app;
}
