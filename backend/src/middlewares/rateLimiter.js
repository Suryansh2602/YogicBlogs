import rateLimit from 'express-rate-limit';
import { RedisStore } from 'rate-limit-redis';
import { redis, redisKey } from '../config/redis.js';

const FIFTEEN_MINUTES = 15 * 60 * 1000;

/**
 * Redis-backed store so limits hold across restarts and multiple API instances.
 * Created lazily (inside createApp) because the store talks to Redis as soon as it exists.
 */
export function createRedisStore(name, client = redis) {
  return new RedisStore({
    prefix: redisKey('rl', name) + ':',
    sendCommand: (...args) => client.sendCommand(args),
  });
}

/** General limit for every request. Fails open if Redis is down so a cache outage isn't a site outage. */
export function createApiLimiter(store, limit = 300, { skip } = {}) {
  return rateLimit({
    windowMs: FIFTEEN_MINUTES,
    limit,
    ...(skip && { skip }),
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    store,
    passOnStoreError: true,
    message: { error: { message: 'Too many requests, please try again later', code: 'RATE_LIMITED' } },
  });
}

/**
 * Strict limit for login, register and password reset to slow down brute force.
 * Fails closed: if the limit can't be checked, the request is refused.
 */
export function createAuthLimiter(store) {
  return rateLimit({
    windowMs: FIFTEEN_MINUTES,
    limit: 30, // per IP; per-account lockout (lockout.service.js) is the main brute-force guard. Many users share one IP behind mobile CGNAT.
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    store,
    passOnStoreError: false,
    message: { error: { message: 'Too many attempts, please try again later', code: 'RATE_LIMITED' } },
  });
}

const ONE_HOUR = 60 * 60 * 1000;

/**
 * Image uploads per admin (not per IP: the route is behind sign-in), so a stolen or runaway session
 * can't fill the disk or hog the image worker. Fails closed like the auth limiter.
 */
export function createUploadLimiter(store, limit = 60) {
  return rateLimit({
    windowMs: ONE_HOUR,
    limit,
    keyGenerator: (req) => `user:${req.auth.userId}`,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    store,
    passOnStoreError: false,
    message: { error: { message: `You've uploaded ${limit} files in the last hour, the most allowed. Please wait a while and try again.`, code: 'UPLOAD_LIMIT' } },
  });
}

/**
 * Draft autosaves per admin: the editor saves 3 s after typing stops, so even non-stop typing stays
 * near 300 per 15 minutes. Twice that leaves room, and stops a runaway tab or script. Fails closed.
 */
export function createAutosaveLimiter(store, limit = 600) {
  return rateLimit({
    windowMs: FIFTEEN_MINUTES,
    limit,
    keyGenerator: (req) => `user:${req.auth.userId}`,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    store,
    passOnStoreError: false,
    message: { error: { message: 'Saving too often: is the article open in many tabs? Close the extra tabs; saving resumes in a few minutes.', code: 'AUTOSAVE_LIMIT' } },
  });
}

/**
 * A separate per-IP budget for one area of the API (article pages for readers, the article editor for
 * admins), so busy readers or an admin writing all morning don't use up the general limit. Fails open.
 */
export function createAreaLimiter(store, limit) {
  return rateLimit({
    windowMs: FIFTEEN_MINUTES,
    limit,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    store,
    passOnStoreError: true,
    message: { error: { message: 'Too many requests, please try again later', code: 'RATE_LIMITED' } },
  });
}

/**
 * Public image requests, kept apart from the general limit: one article page loads several images,
 * and browsers then cache them for a year. Fails open (images aren't a security boundary).
 */
export function createImageLimiter(store, limit = 1500) {
  return rateLimit({
    windowMs: FIFTEEN_MINUTES,
    limit,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    store,
    passOnStoreError: true,
    message: { error: { message: 'Too many requests, please try again later', code: 'RATE_LIMITED' } },
  });
}
