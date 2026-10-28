import { redis as defaultClient, redisKey } from '../config/redis.js';
import { logger } from './logger.js';

/**
 * Read-through JSON cache on Redis. Fails open: if Redis is down the loader result is returned
 * uncached, so a cache outage slows the site down instead of taking it offline.
 */
export function createCache(client = defaultClient) {
  const fullKey = (key) => redisKey('cache', key);

  async function get(key) {
    if (!client.isReady) return undefined;
    try {
      const raw = await client.get(fullKey(key));
      return raw === null ? undefined : JSON.parse(raw);
    } catch (err) {
      logger.warn({ err, key }, 'Cache read failed');
      return undefined;
    }
  }

  async function set(key, value, ttlSeconds) {
    if (!client.isReady) return;
    try {
      await client.set(fullKey(key), JSON.stringify(value), { expiration: { type: 'EX', value: ttlSeconds } });
    } catch (err) {
      logger.warn({ err, key }, 'Cache write failed');
    }
  }

  async function getOrSet(key, ttlSeconds, loader) {
    const cached = await get(key);
    if (cached !== undefined) return cached;
    const fresh = await loader();
    if (fresh !== undefined) await set(key, fresh, ttlSeconds);
    return fresh;
  }

  /** Delete exact keys, e.g. after an admin edits an article. */
  async function del(...keys) {
    if (!client.isReady || keys.length === 0) return;
    try {
      await client.del(keys.map(fullKey));
    } catch (err) {
      logger.warn({ err, keys }, 'Cache delete failed');
    }
  }

  /** Delete every key under a prefix (e.g. "articles:list"), using SCAN so Redis is never blocked. */
  async function delPrefix(prefix) {
    if (!client.isReady) return;
    try {
      for await (const batch of client.scanIterator({ MATCH: `${fullKey(prefix)}*`, COUNT: 100 })) {
        if (batch.length > 0) await client.del(batch);
      }
    } catch (err) {
      logger.warn({ err, prefix }, 'Cache prefix delete failed');
    }
  }

  return { get, set, getOrSet, del, delPrefix };
}

export const cache = createCache();
