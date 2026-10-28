// Short-lived security state (MFA tickets, login-failure counters, cached token versions).
// Redis in production (shared across API instances, survives restarts); an in-memory Map when Redis
// is switched off for local development. Every entry has a TTL.
import { isRedisEnabled, redis, redisKey } from '../config/redis.js';

export function createMemoryStore({ now = () => Date.now() } = {}) {
  const entries = new Map();
  const alive = (key) => {
    const entry = entries.get(key);
    if (!entry) return undefined;
    if (entry.expiresAt <= now()) {
      entries.delete(key);
      return undefined;
    }
    return entry;
  };

  return {
    async get(key) {
      return alive(key)?.value ?? null;
    },
    async set(key, value, ttlSeconds) {
      entries.set(key, { value, expiresAt: now() + ttlSeconds * 1000 });
    },
    /** Read and delete in one step, so a ticket can be used only once. */
    async getDel(key) {
      const value = alive(key)?.value ?? null;
      entries.delete(key);
      return value;
    },
    async del(key) {
      entries.delete(key);
    },
    /** Increment a counter; the TTL starts with the first increment of a window. */
    async incr(key, ttlSeconds) {
      const entry = alive(key);
      const count = (entry ? Number(entry.value) : 0) + 1;
      entries.set(key, { value: String(count), expiresAt: entry ? entry.expiresAt : now() + ttlSeconds * 1000 });
      return count;
    },
    async ttl(key) {
      const entry = alive(key);
      return entry ? Math.ceil((entry.expiresAt - now()) / 1000) : -2;
    },
    /** Test helper. */
    clear() {
      entries.clear();
    },
  };
}

export function createRedisStore(client = redis) {
  const k = (key) => redisKey(key);
  return {
    get: (key) => client.get(k(key)),
    set: (key, value, ttlSeconds) => client.set(k(key), value, { expiration: { type: 'EX', value: ttlSeconds } }),
    getDel: (key) => client.getDel(k(key)),
    del: (key) => client.del(k(key)),
    async incr(key, ttlSeconds) {
      const count = await client.incr(k(key));
      if (count === 1) await client.expire(k(key), ttlSeconds);
      return count;
    },
    ttl: (key) => client.ttl(k(key)),
  };
}

export const ephemeralStore = isRedisEnabled() ? createRedisStore() : createMemoryStore();
