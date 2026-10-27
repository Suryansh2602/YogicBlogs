import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { env } from './config/env.js';
import { isRedisEnabled } from './config/redis.js';
import { createApiLimiter, createAreaLimiter, createAuthLimiter, createAutosaveLimiter, createImageLimiter, createRedisStore, createUploadLimiter } from './middlewares/rateLimiter.js';
import { isDraftSave } from './modules/articles/articles.routes.js';
import { publicImageRouter } from './modules/media/media.routes.js';
import { errorHandler, notFound } from './middlewares/errorHandler.js';
import { createRoutes } from './routes.js';

/**
 * @param {object} [options]
 * @param {boolean} [options.redisRateLimit] Use the Redis store for rate limits
 *   (default: on when Redis is enabled, outside tests; otherwise an in-memory store).
 * @param {number} [options.apiRateLimit] Override the per-IP request limit. Only for load tests that
 *   measure raw capacity; never set in the running server.
 * @param {number} [options.imageRateLimit] Same, for the public image route.
 */
export function createApp({ redisRateLimit = !env.isTest && isRedisEnabled(), apiRateLimit, imageRateLimit } = {}) {
  const app = express();

  app.disable('x-powered-by');
  // Behind a reverse proxy in production, so rate limiting sees the real client IP.
  if (env.isProduction) app.set('trust proxy', 1);

  app.use(helmet());
  // Public images have their own limit (a page loads several), so they're mounted before the general one.
  app.use('/api/v1/media/i', createImageLimiter(redisRateLimit ? createRedisStore('img') : undefined, imageRateLimit), publicImageRouter);
  // Limit before parsing bodies, and on every path, so floods and route scans are throttled too.
  // Readers and the article editor have their own per-IP budgets: many readers share one mobile IP,
  // and an admin's editor makes a request every few seconds (it also has a per-admin autosave limit).
  const store = (name) => (redisRateLimit ? createRedisStore(name) : undefined);
  app.use('/api/v1/articles', createAreaLimiter(store('read'), apiRateLimit ?? 1500));
  app.use('/api/v1/admin/articles', createAreaLimiter(store('edit'), apiRateLimit ?? 3000));
  const ownBudget = (req) => /^\/api\/v1\/(articles|admin\/articles)(\/|\?|$)/.test(req.originalUrl);
  app.use(createApiLimiter(store('api'), apiRateLimit, { skip: ownBudget }));
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
              // Lets the frontend read how long to wait after a lockout or rate limit.
              exposedHeaders: ['Retry-After'],
              maxAge: 600,
            }
          : { origin: false },
      );
    }),
  );
  // JSON only: no urlencoded/multipart parsers, so classic HTML-form CSRF payloads are never parsed.
  // Article draft saves (up to 1 MB) are skipped here and parsed by their route, after admin + 2FA.
  app.use(express.json({ limit: '100kb', type: (req) => Boolean(req.is('application/json')) && !isDraftSave(req) }));
  // Only the auth cookies (HttpOnly, Path=/api/v1/auth) are read; they're signed/hashed server-side.
  app.use(cookieParser());

  const strictLimiter = createAuthLimiter(redisRateLimit ? createRedisStore('auth') : undefined);
  const uploadLimiter = createUploadLimiter(redisRateLimit ? createRedisStore('upload') : undefined);
  const autosaveLimiter = createAutosaveLimiter(redisRateLimit ? createRedisStore('autosave') : undefined);
  app.use('/api/v1', createRoutes({ strictLimiter, uploadLimiter, autosaveLimiter }));

  app.use(notFound);
  app.use(errorHandler);

  return app;
}
