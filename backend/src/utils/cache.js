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

  /**
   * A counter that is part of cache keys (e.g. "articles:g42:…"). Bumping it makes every older entry
   * unreachable at once, without finding and deleting them; they simply expire. null when Redis is
   * unavailable: callers then skip the cache, so a Redis hiccup can never serve stale content.
   */
  async function generation(name) {
    if (!client.isReady) return null;
    try {
      const key = fullKey(`gen:${name}`);
      const value = await client.get(key);
      if (value !== null) return Number(value);
      await client.set(key, '1', { condition: 'NX' });
      return Number(await client.get(key));
    } catch (err) {
      logger.warn({ err, name }, 'Cache generation read failed');
      return null;
    }
  }

  async function bumpGeneration(name) {
    if (!client.isReady) return;
    try {
      await client.incr(fullKey(`gen:${name}`));
    } catch (err) {
      // Entries under the old generation could now be served until they expire: say so loudly.
      logger.error({ err, name }, 'Cache generation bump failed');
    }
  }

  return { get, set, getOrSet, del, delPrefix, generation, bumpGeneration };
}

export const cache = createCache();
