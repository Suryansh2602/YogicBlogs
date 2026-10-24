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
export function createApiLimiter(store) {
  return rateLimit({
    windowMs: FIFTEEN_MINUTES,
    limit: 300,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    store,
    passOnStoreError: true,
    message: { error: { message: 'Too many requests, please try again later' } },
  });
}

/**
 * Strict limit for login, register and password reset to slow down brute force.
 * Fails closed: if the limit can't be checked, the request is refused.
 */
export function createAuthLimiter(store) {
  return rateLimit({
    windowMs: FIFTEEN_MINUTES,
    limit: 10,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    store,
    passOnStoreError: false,
    message: { error: { message: 'Too many attempts, please try again later' } },
  });
}
