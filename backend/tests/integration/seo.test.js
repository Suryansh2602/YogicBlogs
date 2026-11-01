// The sitemap and the article pages over real HTTP (database stubbed): status codes that tell crawlers
// the truth, redirects from old addresses, and hostile addresses that never reach the database.
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';

const state = vi.hoisted(() => ({ indexPath: undefined, csp: undefined, apiUrl: undefined }));

vi.mock('../../src/config/env.js', async (importOriginal) => {
  const { env } = await importOriginal();
  const overrides = { SITE_INDEX_HTML: () => state.indexPath, SITE_CSP: () => state.csp, SITE_API_URL: () => state.apiUrl, APP_URL: () => 'https://site.example/' };
  return { env: new Proxy({ ...env }, { get: (target, key) => (Object.hasOwn(overrides, key) ? overrides[key]() : target[key]) }) };
});
vi.mock('../../src/config/db.js', () => ({ pingDatabase: vi.fn(), closeDatabase: vi.fn(), sequelize: { query: vi.fn() }, models: {} }));
vi.mock('../../src/config/redis.js', () => ({
  pingRedis: vi.fn(),
  isRedisEnabled: vi.fn(() => false),
  redis: {},
  redisKey: (...parts) => `hm:${parts.join(':')}`,
}));
vi.mock('../../src/modules/articles/articles.public.service.js', () => ({ getBySlug: vi.fn(), listPublished: vi.fn() }));

const { sequelize } = await import('../../src/config/db.js');
const { getBySlug } = await import('../../src/modules/articles/articles.public.service.js');
const { clearSeoCache } = await import('../../src/modules/seo/seo.service.js');
const { createApp } = await import('../../src/app.js');
const { ApiError } = await import('../../src/utils/ApiError.js');

const TEMPLATE = '<html lang="en"><head><title>Site</title></head><body><div id="root"></div><script src="/app.js"></script></body></html>';
const ARTICLE = {
  slug: 'calm-breath',
  title: 'Calm breath',
  summary: 'Summary',
  lang: 'en',
  accessLevel: 'public',
  seo: { title: 'Calm breath', description: 'Summary' },
  locked: false,
  cover: { variants: [{ width: 480, url: '/media/i/a/480' }, { width: 1600, url: '/media/i/a/1600' }] },
  body: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Breathe slowly' }] }] },
};

let dir;
let app;

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), 'seo-'));
  await writeFile(join(dir, 'index.html'), TEMPLATE);
});

afterAll(async () => {
  await rm(dir, { recursive: true, force: true });
});

beforeEach(() => {
  vi.clearAllMocks();
  clearSeoCache();
  state.indexPath = join(dir, 'index.html');
  state.csp = "default-src 'self'";
  state.apiUrl = 'https://api.site.example';
  sequelize.query.mockResolvedValue([{ slug: 'calm-breath', lastmod: new Date('2026-10-05T00:00:00Z') }]);
  getBySlug.mockResolvedValue({ payload: ARTICLE, accessLevel: 'public' });
  app = createApp();
});

describe('GET /sitemap.xml', () => {
  it('lists the fixed pages, the seasons and the live articles with their dates', async () => {
    const res = await request(app).get('/sitemap.xml');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/application\/xml/);
    expect(res.text).toContain('<loc>https://site.example/</loc>');
    expect(res.text).toContain('<loc>https://site.example/ritucharya?ritu=vasanta&amp;lang=hi</loc>');
    expect(res.text).toContain('<loc>https://site.example/articles/calm-breath</loc><lastmod>2026-10-05T00:00:00.000Z</lastmod>');
  });

  it('asks only for live, undeleted articles', async () => {
    await request(app).get('/sitemap.xml');
    const [sql] = sequelize.query.mock.calls[0];
    expect(sql).toContain("status = 'published'");
    expect(sql).toContain('published_at <= NOW()');
    expect(sql).toContain('deleted_at IS NULL');
  });

  it('leaves out private pages', async () => {
    const { text } = await request(app).get('/sitemap.xml');
    expect(text).not.toMatch(/signin|dashboard|admin/);
  });

  it('answers many crawlers from one database query', async () => {
    await request(app).get('/sitemap.xml');
    await request(app).get('/sitemap.xml');
    expect(sequelize.query).toHaveBeenCalledOnce();
  });
});

describe('GET /articles/:slug', () => {
  it('serves the page with the article in the head and the text in noscript', async () => {
    const res = await request(app).get('/articles/calm-breath');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/text\/html/);
    expect(res.headers['content-security-policy']).toBe("default-src 'self'");
    expect(res.text).toContain('<title>Calm breath · Healthmarg</title>');
    expect(res.text).toContain('<p>Breathe slowly</p>');
    expect(res.text).toContain('src="/app.js"');
    expect(res.text).toContain('content="https://api.site.example/api/v1/media/i/a/1600"');
  });

  it('never reads a signed-in view, whatever cookies or tokens come with the request', async () => {
    await request(app).get('/articles/calm-breath').set('Authorization', 'Bearer anything').set('Cookie', 'session=anything');
    expect(getBySlug).toHaveBeenCalledWith('calm-breath', { signedIn: false });
  });

  it('falls back to the site image without a public API address or a cover', async () => {
    state.apiUrl = undefined;
    const res = await request(app).get('/articles/calm-breath');
    expect(res.text).toContain('content="https://site.example/og-default.png"');
  });

  it('sends an old address to the new one, permanently', async () => {
    getBySlug.mockResolvedValue({ redirect: 'new-name' });
    const res = await request(app).get('/articles/old-name');
    expect(res.status).toBe(301);
    expect(res.headers.location).toBe('/articles/new-name');
  });

  it('answers 404 with noindex for a missing article, and the site still loads', async () => {
    getBySlug.mockRejectedValue(ApiError.notFound('gone'));
    const res = await request(app).get('/articles/no-such-article');
    expect(res.status).toBe(404);
    expect(res.text).toContain('<meta name="robots" content="noindex" />');
    expect(res.text).toContain('src="/app.js"');
  });

  it('answers 503 + Retry-After when the database is down, so crawlers come back', async () => {
    getBySlug.mockRejectedValue(new Error('connect ECONNREFUSED 10.0.0.1:3306'));
    const res = await request(app).get('/articles/calm-breath');
    expect(res.status).toBe(503);
    expect(res.headers['retry-after']).toBe('30');
    expect(res.text).toContain('src="/app.js"');
    expect(res.text).not.toContain('ECONNREFUSED');
  });

  it.each(['/articles/..%2f..%2fetc%2fpasswd', '/articles/%3Cscript%3Ealert(1)%3C%2Fscript%3E', `/articles/${'a'.repeat(300)}`, "/articles/x'%20OR%201=1--"])(
    'refuses the hostile address %s before any lookup',
    async (path) => {
      const res = await request(app).get(path);
      expect(res.status).toBe(404);
      expect(getBySlug).not.toHaveBeenCalled();
      expect(res.text).not.toContain('alert(1)');
    },
  );

  it('does not leak the file path when index.html is missing', async () => {
    state.indexPath = join(dir, 'gone.html');
    const res = await request(app).get('/articles/calm-breath');
    expect(res.status).toBe(500);
    expect(res.text).not.toContain('gone.html');
    expect(res.text).not.toContain('ENOENT');
  });

  it('is off, as before, without SITE_INDEX_HTML', async () => {
    state.indexPath = undefined;
    const res = await request(createApp()).get('/articles/calm-breath');
    expect(res.status).toBe(404);
    expect(getBySlug).not.toHaveBeenCalled();
  });

  it('only answers GET and HEAD', async () => {
    const res = await request(app).post('/articles/calm-breath').send({});
    expect(res.status).toBe(404);
    expect(getBySlug).not.toHaveBeenCalled();
  });
});
