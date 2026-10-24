import { describe, expect, it, vi } from 'vitest';
import { createCache } from '../../src/utils/cache.js';

function fakeRedis({ ready = true } = {}) {
  const store = new Map();
  return {
    store,
    isReady: ready,
    get: vi.fn(async (k) => (store.has(k) ? store.get(k) : null)),
    set: vi.fn(async (k, v) => store.set(k, v)),
    del: vi.fn(async (keys) => keys.forEach((k) => store.delete(k))),
    scanIterator: vi.fn(async function* ({ MATCH }) {
      const prefix = MATCH.slice(0, -1);
      yield [...store.keys()].filter((k) => k.startsWith(prefix));
    }),
  };
}

describe('cache', () => {
  it('namespaces keys and stores JSON with a TTL', async () => {
    const client = fakeRedis();
    await createCache(client).set('conditions', [{ id: 1 }], 120);
    expect(client.set).toHaveBeenCalledWith('nn:cache:conditions', '[{"id":1}]', {
      expiration: { type: 'EX', value: 120 },
    });
  });

  it('getOrSet calls the loader only on a miss', async () => {
    const cache = createCache(fakeRedis());
    const loader = vi.fn().mockResolvedValue({ a: 1 });
    expect(await cache.getOrSet('k', 60, loader)).toEqual({ a: 1 });
    expect(await cache.getOrSet('k', 60, loader)).toEqual({ a: 1 });
    expect(loader).toHaveBeenCalledOnce();
  });

  it('fails open when Redis is not ready', async () => {
    const client = fakeRedis({ ready: false });
    const cache = createCache(client);
    const loader = vi.fn().mockResolvedValue('fresh');
    expect(await cache.getOrSet('k', 60, loader)).toBe('fresh');
    expect(client.get).not.toHaveBeenCalled();
    expect(client.set).not.toHaveBeenCalled();
  });

  it('fails open when a Redis command errors', async () => {
    const client = fakeRedis();
    client.get.mockRejectedValue(new Error('READONLY'));
    client.set.mockRejectedValue(new Error('OOM'));
    const cache = createCache(client);
    expect(await cache.getOrSet('k', 60, async () => 'fresh')).toBe('fresh');
  });

  it('treats corrupt cached JSON as a miss', async () => {
    const client = fakeRedis();
    client.store.set('nn:cache:k', '{not json');
    expect(await createCache(client).get('k')).toBeUndefined();
  });

  it('del and delPrefix only touch our namespace', async () => {
    const client = fakeRedis();
    const cache = createCache(client);
    await cache.set('articles:list:1', 1, 60);
    await cache.set('articles:item:a', 2, 60);
    client.store.set('other-app:key', 'keep');

    await cache.delPrefix('articles:list');
    expect([...client.store.keys()]).toEqual(['nn:cache:articles:item:a', 'other-app:key']);

    await cache.del('articles:item:a');
    expect([...client.store.keys()]).toEqual(['other-app:key']);
  });

  it('does not cache undefined loader results', async () => {
    const client = fakeRedis();
    await createCache(client).getOrSet('k', 60, async () => undefined);
    expect(client.set).not.toHaveBeenCalled();
  });
});
