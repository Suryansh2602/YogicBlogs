import { createClient } from 'redis';
import { env } from './env.js';
import { logger } from '../utils/logger.js';

/** All keys live under one namespace so the DB can be shared and scanned safely. See docs/database.md. */
export const KEY_PREFIX = 'hm:';
export const redisKey = (...parts) => KEY_PREFIX + parts.join(':');

export function createRedisClient() {
  const client = createClient({
    socket: {
      host: env.REDIS_HOST,
      port: env.REDIS_PORT,
      tls: env.REDIS_TLS,
      connectTimeout: 5_000,
      // Back off up to 3 s between reconnect attempts, forever: a blip must not kill the API.
      reconnectStrategy: (retries) => Math.min(retries * 100, 3_000),
    },
    password: env.REDIS_PASSWORD || undefined,
    database: env.REDIS_DB,
    // Fail commands immediately while disconnected instead of queueing them, so requests never hang
    // on a Redis outage: the cache falls back to MySQL and rate limits follow their fail-open/closed rule.
    disableOfflineQueue: true,
  });

  // Without a listener, node-redis throws on connection errors and crashes the process.
  client.on('error', (err) => logger.error({ err }, 'Redis error'));
  client.on('reconnecting', () => logger.warn('Redis reconnecting'));
  client.on('ready', () => logger.info('Redis ready'));

  return client;
}

export const redis = createRedisClient();

/** False only in local development when REDIS_ENABLED=false (production refuses to start that way). */
export const isRedisEnabled = () => env.REDIS_ENABLED;

export async function connectRedis() {
  if (!isRedisEnabled()) return;
  if (!redis.isOpen) await redis.connect();
}

export async function pingRedis() {
  if (!redis.isReady) throw new Error('Redis is not connected');
  await redis.ping();
}

export async function closeRedis() {
  if (redis.isOpen) await redis.close();
}
