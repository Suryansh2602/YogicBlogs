import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import express from 'express';
import request from 'supertest';
import { closeRedis, connectRedis, isRedisEnabled, pingRedis, redis, redisKey } from '../../src/config/redis.js';
import { createCache } from '../../src/utils/cache.js';
import { createAuthLimiter, createRedisStore } from '../../src/middlewares/rateLimiter.js';

// Redis is optional locally (REDIS_ENABLED=false) but mandatory in production; these run whenever it's enabled.
describe.skipIf(!isRedisEnabled())('Redis', () => {
  beforeAll(async () => {
    await connectRedis();
    // Only ever wipe our own namespace, and only in the test DB index.
    for await (const keys of redis.scanIterator({ MATCH: `${redisKey('')}*`, COUNT: 100 })) {
      if (keys.length) await redis.del(keys);
    }
  });

  afterAll(async () => {
    await closeRedis();
  });

  it('connects with the configured password and answers PING', async () => {
    await expect(pingRedis()).resolves.toBeUndefined();
  });

  it('cache.getOrSet loads once, then serves from Redis with a TTL', async () => {
    const cache = createCache(redis);
    let loads = 0;
    const loader = async () => ({ loads: ++loads });

    expect(await cache.getOrSet('conditions:list', 60, loader)).toEqual({ loads: 1 });
    expect(await cache.getOrSet('conditions:list', 60, loader)).toEqual({ loads: 1 });

    const ttl = await redis.ttl(redisKey('cache', 'conditions:list'));
    expect(ttl).toBeGreaterThan(0);
    expect(ttl).toBeLessThanOrEqual(60);
  });

  it('cache.delPrefix removes only the matching keys', async () => {
    const cache = createCache(redis);
    await cache.set('articles:list:1', [1], 60);
    await cache.set('articles:list:2', [2], 60);
    await cache.set('articles:item:x', { x: 1 }, 60);

    await cache.delPrefix('articles:list');

    expect(await cache.get('articles:list:1')).toBeUndefined();
    expect(await cache.get('articles:list:2')).toBeUndefined();
    expect(await cache.get('articles:item:x')).toEqual({ x: 1 });
  });

  it('rate limits are shared through Redis (strict auth limiter blocks the 11th attempt)', async () => {
    const app = express();
    app.post('/login', createAuthLimiter(createRedisStore('test-auth')), (_req, res) => res.sendStatus(204));

    for (let i = 0; i < 10; i += 1) {
      expect((await request(app).post('/login')).status).toBe(204);
    }
    const blocked = await request(app).post('/login');
    expect(blocked.status).toBe(429);

    const keys = [];
    for await (const batch of redis.scanIterator({ MATCH: `${redisKey('rl', 'test-auth')}:*` })) keys.push(...batch);
    expect(keys.length).toBeGreaterThan(0);
  });
});
