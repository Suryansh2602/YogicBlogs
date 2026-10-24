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
 */
export function createApp({ redisRateLimit = !env.isTest && isRedisEnabled() } = {}) {
  const app = express();

  app.disable('x-powered-by');
  // Behind a reverse proxy in production, so rate limiting sees the real client IP.
  if (env.isProduction) app.set('trust proxy', 1);

  app.use(helmet());
  // Limit before parsing bodies, and on every path, so floods and route scans are throttled too.
  app.use(createApiLimiter(redisRateLimit ? createRedisStore('api') : undefined));
  // The frontend is a separate app on its own origin: only origins on the allow-list may call the API.
  app.use(cors({ origin: env.CLIENT_ORIGIN, credentials: true }));
  app.use(express.json({ limit: '100kb' }));
  app.use(express.urlencoded({ extended: false, limit: '100kb' }));

  app.use('/api/v1', routes);

  app.use(notFound);
  app.use(errorHandler);

  return app;
}
