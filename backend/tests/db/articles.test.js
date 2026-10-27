// Articles through the real HTTP app and MySQL: drafts and autosave, the publish checklist, publishing,
// what readers (anonymous and signed in) can see, references, revisions, delete, and the attacks on them.
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import http from 'node:http';
import request from 'supertest';

const { createApp } = await import('../../src/app.js');
const { closeDatabase, models } = await import('../../src/config/db.js');
const { env } = await import('../../src/config/env.js');
const { signAccessToken } = await import('../../src/modules/auth/token.service.js');
const { connectAsMigrator, resetTables } = await import('./helpers.js');

let seq = 0;
async function tokenFor(role, { otp = true } = {}) {
  seq += 1;
  const user = await models.User.create({ email: `art-${role}${seq}@example.com`, displayName: `${role} ${seq}`, role, emailVerifiedAt: new Date() });
  return `Bearer ${await signAccessToken(user, { sid: `sid-a${seq}`, amr: otp ? ['pwd', 'otp'] : ['pwd'] })}`;
}

const WORDS = 'Slow steady breathing calms the nervous system and eases the tension that so often sits behind a migraine. '.repeat(4).trim();
const text = (t, marks) => (marks ? { type: 'text', text: t, marks } : { type: 'text', text: t });
const para = (...content) => ({ type: 'paragraph', content });
const docOf = (...blocks) => ({ type: 'doc', content: blocks });

describe('articles (real database)', () => {
  let app;
  let migrator;
  let admin;
  let member;
  let condition;
  let image;

  beforeAll(async () => {
    migrator = connectAsMigrator();
    app = createApp();
  });

  beforeEach(async () => {
    await resetTables(migrator);
    admin = await tokenFor('admin');
    member = await tokenFor('user');
    condition = await models.Condition.create({ name: 'Migraine', slug: 'migraine', isPublished: true });
    image = await models.Media.create({
      kind: 'image',
      visibility: 'public',
      storageKey: `images/test/${seq}-960.webp`,
      variants: { 480: { key: 'images/test/x-480.webp', height: 320 }, 960: { key: 'images/test/x-960.webp', height: 640 } },
      mimeType: 'image/webp',
      sizeBytes: 1000,
      checksumSha256: 'c'.repeat(64),
      width: 960,
      height: 640,
      altText: 'Woman breathing slowly',
      placeholder: 'data:image/webp;base64,AA==',
    });
  });

  afterAll(async () => {
    await Promise.all([migrator.close(), closeDatabase()]);
  });

  const api = (method, path, auth = admin) => request(app)[method](`/api/v1${path}`).set('Authorization', auth);
  const create = (body = {}) => api('post', '/admin/articles').send({ title: 'Calming migraine with breath', conditionId: condition.id, ...body });
  const fullDraft = (over = {}) => ({
    title: 'Calming migraine with breath',
    slug: '',
    summary: 'A gentle breathing routine that can ease the build-up of a migraine.',
    conditionId: condition.id,
    accessLevel: 'public',
    lang: 'en',
    accent: 'teal',
    cover: { mediaId: image.id, alt: '', focalX: 50, focalY: 30 },
    relatedIds: [],
    seoTitle: '',
    seoDescription: '',
    body: docOf(para(text(WORDS))),
    ...over,
  });
  const save = (id, draftVersion, draft) => api('put', `/admin/articles/${id}/draft`).send({ draftVersion, draft });

  /** Create, fill and publish an article; returns its id and draftVersion. */
  async function published(over = {}) {
    const { article } = (await create().expect(201)).body;
    const saved = (await save(article.id, article.draftVersion, fullDraft(over)).expect(200)).body;
    await api('post', `/admin/articles/${article.id}/publish`).send({ draftVersion: saved.draftVersion }).expect(200);
    return { id: article.id, draftVersion: saved.draftVersion };
  }
  /** Declare a large body, send only a few bytes, and read the reply: proves the body was never read. */
  const declareLarge = (method, path, headers, bytes) =>
    new Promise((resolvePromise, reject) => {
      const server = app.listen(0, () => {
        const req = http.request(
          { port: server.address().port, method, path, headers: { 'Content-Type': 'application/json', 'Content-Length': String(bytes), ...headers } },
          (response) => {
            let body = '';
            response.on('data', (chunk) => (body += chunk));
            response.on('end', () => {
              req.destroy();
              server.close();
              resolvePromise({ status: response.statusCode, body: JSON.parse(body) });
            });
          },
        );
        req.on('error', (err) => (server.close(), reject(err)));
        req.write('{"draftVersion":1,');
      });
    });
  const auditActions = async () => (await migrator.query(`SELECT action FROM \`${env.AUDIT_DB_NAME}\`.audit_logs`))[0].map((a) => a.action);

  describe('access', () => {
    it('admin routes need a signed-in admin whose session passed 2FA', async () => {
      await request(app).get('/api/v1/admin/articles').expect(401);
      expect((await api('get', '/admin/articles', member).expect(403)).body.error.code).toBe('FORBIDDEN');
      expect((await api('get', '/admin/articles', await tokenFor('admin', { otp: false })).expect(403)).body.error.code).toBe('MFA_REQUIRED');
    });

    it('never reads a large draft body from someone who isn’t a signed-in admin', async () => {
      const anon = await declareLarge('PUT', '/api/v1/admin/articles/018f2a3c-0000-7000-8000-000000000000/draft', {}, 900_000);
      expect(anon).toMatchObject({ status: 401, body: { error: { code: 'NO_TOKEN' } } });
      const memberTry = await declareLarge('PUT', '/api/v1/admin/articles/018f2a3c-0000-7000-8000-000000000000/draft', { Authorization: member }, 900_000);
      expect(memberTry.status).toBe(403);
      // Other routes still refuse bodies over 100 kB, even from admins. (The JSON parser reads the rest of
      // an oversized body before answering, so this one is sent in full.)
      await api('post', '/admin/articles').send({ title: 'x'.repeat(200_000), conditionId: condition.id }).expect(413);
    });
  });

  describe('drafts and autosave', () => {
    it('creates a draft with an empty body, audited, and lists it with its draft title', async () => {
      const res = await create().expect(201);
      expect(res.body.article).toMatchObject({ status: 'draft', slug: null, draftVersion: 1, hasUnpublishedChanges: false, inboundCount: 0 });
      expect(res.body.article.draft).toMatchObject({ title: 'Calming migraine with breath', conditionId: condition.id, accessLevel: 'members', body: { type: 'doc', content: [] } });
      expect(res.body.article.checklist.ready).toBe(false);
      const list = await api('get', '/admin/articles?q=migraine').expect(200);
      expect(list.body).toMatchObject({ total: 1, items: [{ title: 'Calming migraine with breath', status: 'draft', condition: { name: 'Migraine' } }] });
      expect(await auditActions()).toContain('article.created');
      await create({ conditionId: '018f2a3c-0000-7000-8000-000000000000' }).expect(400);
    });

    it('saves with optimistic locking: a stale tab gets 409 with who saved, an identical save writes nothing', async () => {
      const { article } = (await create().expect(201)).body;
      const first = await save(article.id, 1, fullDraft()).expect(200);
      expect(first.body).toMatchObject({ draftVersion: 2, hasUnpublishedChanges: false });
      const again = await save(article.id, 2, fullDraft()).expect(200);
      expect(again.body.draftVersion).toBe(2); // nothing changed, nothing written
      const stale = await save(article.id, 1, fullDraft({ title: 'Other tab' })).expect(409);
      expect(stale.body.error).toMatchObject({ code: 'STALE_VERSION', details: { draftVersion: 2 } });
      expect(stale.body.error.message).toMatch(/^Someone saved this article after you opened it \(admin \d+\)\./);
      const loaded = await api('get', `/admin/articles/${article.id}`).expect(200);
      expect(loaded.body.article.draft.title).toBe('Calming migraine with breath');
    });

    it('accepts a draft larger than 100 kB (up to 1 MB) and refuses one over 1 MB', async () => {
      const { article } = (await create().expect(201)).body;
      const long = Array.from({ length: 30 }, () => para(text('word '.repeat(1000).trim())));
      await save(article.id, 1, fullDraft({ body: docOf(...long) })).expect(200);
      const huge = Array.from({ length: 70 }, () => para(text('a'.repeat(16_000))));
      await save(article.id, 2, fullDraft({ body: docOf(...huge) })).expect(413);
    });

    it('names exactly what is wrong with a hostile or broken draft', async () => {
      const { article } = (await create().expect(201)).body;
      const xss = await save(article.id, 1, fullDraft({ body: docOf(para(text('click', [{ type: 'link', attrs: { href: 'javascript:alert(1)' } }]))) })).expect(400);
      expect(xss.body.error).toMatchObject({ code: 'INVALID_DOCUMENT' });
      expect(xss.body.error.details[0]).toEqual({ path: 'draft.body.content[0].content[0].marks[0].attrs.href', message: 'href must start with https:// (or be a mailto: email link)' });
      const html = await save(article.id, 1, fullDraft({ body: docOf({ type: 'html', content: [text('<script>')] }) })).expect(400);
      expect(html.body.error.details[0].message).toBe('content[0] "html" is not an allowed block');
      const self = await save(article.id, 1, fullDraft({ relatedIds: [article.id] })).expect(400);
      expect(self.body.error.details[0].message).toBe('An article can’t be related to itself.');
      const smuggled = await save(article.id, 1, { ...fullDraft(), status: 'published' }).expect(400);
      expect(smuggled.body.error.code).toBe('VALIDATION_FAILED');
      const longTitle = await save(article.id, 1, fullDraft({ title: 'x'.repeat(250) })).expect(400);
      expect(longTitle.body.error.details[0].message).toBe('The title has 250 characters. Keep it to 200.');
    });
  });

  describe('publish checklist', () => {
    it('lists every blocking problem of a fresh draft, and publishing refuses with the same list', async () => {
      const { article } = (await create().expect(201)).body;
      const check = await api('get', `/admin/articles/${article.id}/checklist`).expect(200);
      expect(check.body.ready).toBe(false);
      const fields = check.body.problems.filter((p) => p.blocking).map((p) => p.field);
      expect(fields).toEqual(expect.arrayContaining(['summary', 'cover', 'body']));
      const res = await api('post', `/admin/articles/${article.id}/publish`).send({ draftVersion: 1 }).expect(422);
      expect(res.body.error.code).toBe('PUBLISH_CHECKLIST');
      expect(res.body.error.details.find((p) => p.field === 'body').message).toBe('The article has 0 words. Write at least 50.');
      expect(res.body.error.details.find((p) => p.field === 'summary').message).toMatch(/^The short description has 0 characters\. Write at least 40/);
    });

    it('requires a published condition and alt text on every image', async () => {
      await models.Media.update({ altText: null }, { where: { id: image.id } });
      await models.Condition.update({ isPublished: false }, { where: { id: condition.id } });
      const { article } = (await create().expect(201)).body;
      await save(article.id, 1, fullDraft({ body: docOf(para(text(WORDS)), { type: 'image', attrs: { mediaId: image.id } }) })).expect(200);
      const { problems } = (await api('get', `/admin/articles/${article.id}/checklist`).expect(200)).body;
      expect(problems).toEqual(
        expect.arrayContaining([
          { field: 'conditionId', message: 'The condition “Migraine” is hidden. Publish it first (Admin → Conditions).', blocking: true },
          { field: 'cover.alt', message: 'Describe the thumbnail image (alt text) for people who can’t see it.', blocking: true },
          { field: 'body.image[0]', message: 'Describe image 1 (alt text) for people who can’t see it.', blocking: true },
        ]),
      );
    });
  });

  describe('publishing and readers', () => {
    it('publishes: readers see the live copy; later edits stay private until published again', async () => {
      const { id, draftVersion } = await published();
      const pub = await request(app).get('/api/v1/articles/calming-migraine-with-breath').expect(200);
      expect(pub.headers['cache-control']).toBe('public, max-age=60');
      expect(pub.body.article).toMatchObject({
        slug: 'calming-migraine-with-breath',
        title: 'Calming migraine with breath',
        accent: 'teal',
        locked: false,
        readingMinutes: 1,
        condition: { slug: 'migraine', name: 'Migraine' },
        cover: { alt: 'Woman breathing slowly', width: 960 },
      });
      expect(pub.body.article.cover.variants[0].url).toBe(`/media/i/${image.id}/480`);

      const edited = await save(id, draftVersion, fullDraft({ title: 'A new title, not yet live' })).expect(200);
      expect(edited.body.hasUnpublishedChanges).toBe(true);
      expect((await request(app).get('/api/v1/articles/calming-migraine-with-breath').expect(200)).body.article.title).toBe('Calming migraine with breath');
      expect((await api('get', '/admin/articles').expect(200)).body.items[0]).toMatchObject({ title: 'A new title, not yet live', hasUnpublishedChanges: true });

      const preview = await api('get', `/admin/articles/${id}/preview`).expect(200);
      expect(preview.body.preview.title).toBe('A new title, not yet live');
      expect(await auditActions()).toEqual(expect.arrayContaining(['article.published', 'article.draft_saved']));
    });

    it('never shows a draft to anyone, and members articles in full only to signed-in readers', async () => {
      const { article } = (await create().expect(201)).body;
      await save(article.id, 1, fullDraft({ slug: 'secret-draft' })).expect(200);
      await request(app).get('/api/v1/articles/secret-draft').expect(404);
      await request(app).get('/api/v1/articles/secret-draft').set('Authorization', member).expect(404);

      await published({ slug: 'members-only', accessLevel: 'members' });
      const anon = await request(app).get('/api/v1/articles/members-only').expect(200);
      expect(anon.headers['cache-control']).toBe('private, no-store');
      expect(anon.headers.vary).toMatch(/Authorization/);
      expect(anon.body.article).toMatchObject({ locked: true, reason: 'SIGN_IN_REQUIRED', title: 'Calming migraine with breath' });
      expect(anon.body.article.body).toBeUndefined();
      const signedIn = await request(app).get('/api/v1/articles/members-only').set('Authorization', member).expect(200);
      expect(signedIn.body.article.locked).toBe(false);
      expect(JSON.stringify(signedIn.body.article.body)).toContain('Slow steady breathing');
      // A broken token is a 401 (the site refreshes), never a quiet teaser.
      await request(app).get('/api/v1/articles/members-only').set('Authorization', 'Bearer not-a-token').expect(401);
    });

    it('keeps old addresses working after the web address changes', async () => {
      const { id, draftVersion } = await published({ slug: 'old-address' });
      const saved = await save(id, draftVersion, fullDraft({ slug: 'new-address' })).expect(200);
      await api('post', `/admin/articles/${id}/publish`).send({ draftVersion: saved.body.draftVersion }).expect(200);
      expect((await request(app).get('/api/v1/articles/old-address').expect(200)).body).toEqual({ redirect: 'new-address' });
      await request(app).get('/api/v1/articles/new-address').expect(200);
      // Another article can't take the old address.
      const { article: other } = (await create({ title: 'Another one' }).expect(201)).body;
      await save(other.id, 1, fullDraft({ title: 'Another one', slug: 'old-address' })).expect(200);
      const blocked = await api('post', `/admin/articles/${other.id}/publish`).send({ draftVersion: 2 }).expect(422);
      expect(blocked.body.error.details[0].message).toMatch(/used to belong to another article/);
    });

    it('lists published articles newest first with stable paging, by condition and by search', async () => {
      for (const t of ['First breathing article', 'Second breathing article', 'Third article about sleep']) {
        await published({ title: t, slug: '', body: docOf(para(text(`${WORDS} ${t}`))) });
      }
      const page1 = await request(app).get('/api/v1/articles?limit=2').expect(200);
      expect(page1.body.items.map((a) => a.title)).toEqual(['Third article about sleep', 'Second breathing article']);
      const page2 = await request(app).get(`/api/v1/articles?limit=2&cursor=${page1.body.nextCursor}`).expect(200);
      expect(page2.body.items.map((a) => a.title)).toEqual(['First breathing article']);
      expect(page2.body.nextCursor).toBeNull();
      expect((await request(app).get('/api/v1/articles?condition=insomnia').expect(200)).body.items).toEqual([]);
      const found = await request(app).get('/api/v1/articles?q=sleep').expect(200);
      expect(found.body.items.map((a) => a.title)).toEqual(['Third article about sleep']);
      await request(app).get('/api/v1/articles?cursor=not-a-real-cursor').expect(400);
    });
  });

  describe('references between articles', () => {
    it('never reveals an unpublished article to readers; asks before unpublishing a linked-to article', async () => {
      const { article: target } = (await create({ title: 'Target article' }).expect(201)).body;
      const linking = await published({
        slug: 'linking',
        body: docOf(para(text(WORDS), text(' see '), text('this', [{ type: 'articleLink', attrs: { articleId: target.id } }])), { type: 'articleCard', attrs: { articleId: target.id } }),
        relatedIds: [target.id],
      });
      const before = await request(app).get('/api/v1/articles/linking').expect(200);
      expect(JSON.stringify(before.body)).not.toContain(target.id);
      expect(before.body.article.related).toEqual([]);

      // Publish the target: the link, card and related entry appear.
      await save(target.id, 1, fullDraft({ title: 'Target article', slug: 'target' })).expect(200);
      await api('post', `/admin/articles/${target.id}/publish`).send({ draftVersion: 2 }).expect(200);
      const after = await request(app).get('/api/v1/articles/linking').expect(200);
      expect(after.body.article.articles[target.id]).toMatchObject({ slug: 'target', title: 'Target article' });
      expect(after.body.article.related).toHaveLength(1);

      const ask = await api('post', `/admin/articles/${target.id}/unpublish`).send({}).expect(409);
      expect(ask.body.error).toMatchObject({ code: 'HAS_INBOUND_LINKS', details: { count: 1 } });
      await api('post', `/admin/articles/${target.id}/unpublish`).send({ confirm: true }).expect(200);
      await request(app).get('/api/v1/articles/target').expect(404);
      expect(JSON.stringify((await request(app).get('/api/v1/articles/linking').expect(200)).body)).not.toContain(target.id);
      const outbound = (await api('get', `/admin/articles/${linking.id}`).expect(200)).body.article.references;
      expect(outbound).toEqual(expect.arrayContaining([expect.objectContaining({ articleId: target.id, kind: 'card', state: 'draft', title: 'Target article' })]));
    });

    it('protects media and conditions that articles use', async () => {
      const { article } = (await create().expect(201)).body;
      const other = await models.Media.create({ kind: 'image', visibility: 'public', storageKey: 'images/test/other.webp', variants: {}, mimeType: 'image/webp', sizeBytes: 1, checksumSha256: 'd'.repeat(64) });
      await save(article.id, 1, fullDraft({ body: docOf(para(text(WORDS)), { type: 'image', attrs: { mediaId: other.id, alt: 'x' } }) })).expect(200);
      const used = await api('delete', `/admin/media/${other.id}`).expect(409);
      expect(used.body.error).toMatchObject({ code: 'MEDIA_IN_USE', message: 'This file is used by 1 article. Remove it from there first.' });

      const { id } = await published({ slug: 'filed-here' });
      const hide = await api('patch', `/admin/conditions/${condition.id}`).send({ isPublished: false }).expect(409);
      expect(hide.body.error.code).toBe('CONDITION_HAS_PUBLISHED_ARTICLES');
      const elsewhere = await models.Condition.create({ name: 'Insomnia', slug: 'insomnia', isPublished: true });
      await save(article.id, 2, fullDraft({ conditionId: elsewhere.id })).expect(200);
      expect((await api('delete', `/admin/conditions/${elsewhere.id}`).expect(409)).body.error.code).toBe('CONDITION_IN_USE');
      void id;
    });
  });

  describe('status changes, delete and revisions', () => {
    it('archives (not public), discards unpublished changes, and refuses a stale or unconfirmed delete', async () => {
      const { id, draftVersion } = await published({ slug: 'to-archive' });
      const edited = (await save(id, draftVersion, fullDraft({ slug: 'to-archive', title: 'Changed my mind' })).expect(200)).body;
      const discarded = await api('post', `/admin/articles/${id}/discard-draft`).send({ draftVersion: edited.draftVersion }).expect(200);
      expect(discarded.body.article).toMatchObject({ hasUnpublishedChanges: false, draft: { title: 'Calming migraine with breath' } });

      await api('post', `/admin/articles/${id}/archive`).send({}).expect(200);
      await request(app).get('/api/v1/articles/to-archive').expect(404);

      await api('delete', `/admin/articles/${id}`).send({ draftVersion: 1 }).expect(409);
      await api('delete', `/admin/articles/${id}`).send({ draftVersion: discarded.body.article.draftVersion }).expect(204);
      await api('get', `/admin/articles/${id}`).expect(404);
      const late = await save(id, discarded.body.article.draftVersion, fullDraft()).expect(410);
      expect(late.body.error.code).toBe('ARTICLE_DELETED');
      expect(await auditActions()).toEqual(expect.arrayContaining(['article.archived', 'article.draft_discarded', 'article.deleted']));
    });

    it('keeps revisions without loading their contents in the list, and restores one (undoably)', async () => {
      const { article } = (await create().expect(201)).body;
      await save(article.id, 1, fullDraft({ title: 'Version one' })).expect(200); // first save: an autosnap
      await api('post', `/admin/articles/${article.id}/revisions`).expect(201); // identical: not stored twice
      const v3 = (await save(article.id, 2, fullDraft({ title: 'Version two' })).expect(200)).body;
      await api('post', `/admin/articles/${article.id}/revisions`).expect(201);
      const list = (await api('get', `/admin/articles/${article.id}/revisions`).expect(200)).body.items;
      expect(list.map((r) => r.reason)).toEqual(['manual', 'autosnap']);
      expect(list[0].snapshot).toBeUndefined();
      const autosnap = list.find((r) => r.reason === 'autosnap');
      const one = (await api('get', `/admin/articles/${article.id}/revisions/${autosnap.id}`).expect(200)).body.revision;
      expect(one.snapshot.title).toBe('Version one');

      const restored = await api('post', `/admin/articles/${article.id}/revisions/${autosnap.id}/restore`).send({ draftVersion: v3.draftVersion }).expect(200);
      expect(restored.body.article.draft.title).toBe('Version one');
      // The draft from before the restore ("Version two") is still recoverable. Here it equals the manual
      // revision saved just before, so it isn't stored a second time.
      const items = (await api('get', `/admin/articles/${article.id}/revisions`).expect(200)).body.items;
      const titles = await Promise.all(items.map(async (r) => (await api('get', `/admin/articles/${article.id}/revisions/${r.id}`).expect(200)).body.revision.snapshot.title));
      expect(titles).toContain('Version two');
      await api('get', `/admin/articles/${article.id}/revisions/999999`).expect(404);
    });
  });
  describe('review fixes', () => {
    it('gives readers and the editor their own request budgets, separate from the general limit', async () => {
      const limited = createApp();
      for (let i = 0; i < 300; i += 1) await request(limited).get('/api/v1/health');
      await request(limited).get('/api/v1/health').expect(429);
      // The general limit is used up, but reading and editing articles still work.
      await request(limited).get('/api/v1/articles').expect(200);
      await request(limited).get('/api/v1/admin/articles').set('Authorization', admin).expect(200);
    }, 120_000);

    it('keeps a published article’s address when its title changes and the address field is empty', async () => {
      const { id, draftVersion } = await published({ slug: '' });
      const saved = await save(id, draftVersion, fullDraft({ slug: '', title: 'Calming migraine naturally' })).expect(200);
      await api('post', `/admin/articles/${id}/publish`).send({ draftVersion: saved.body.draftVersion }).expect(200);
      const page = await request(app).get('/api/v1/articles/calming-migraine-with-breath').expect(200);
      expect(page.body.article.title).toBe('Calming migraine naturally');
      await request(app).get('/api/v1/articles/calming-migraine-naturally').expect(404);
    });

    it('never lets an error be cached publicly', async () => {
      const res = await request(app).get('/api/v1/articles?cursor=bm90LWEtY3Vyc29y').expect(400);
      expect(res.headers['cache-control'] ?? '').not.toMatch(/public/); // no header at all, or a private one
    });

    it('reports draft field problems under "draft.", and short titles with the specific message', async () => {
      const { article } = (await create().expect(201)).body;
      const bad = await save(article.id, 1, fullDraft({ accent: 'neon' })).expect(400);
      expect(bad.body.error.details[0].path).toBe('draft.accent');
      const short = await create({ title: 'ab' }).expect(400);
      expect(short.body.error.details[0].message).toBe('The title needs at least 3 characters.');
    });

    it('gives the specific message when two articles publish the same address at the same moment', async () => {
      const a = (await create({ title: 'First of two' }).expect(201)).body.article;
      const b = (await create({ title: 'Second of two' }).expect(201)).body.article;
      await save(a.id, 1, fullDraft({ title: 'First of two', slug: 'same-address' })).expect(200);
      await save(b.id, 1, fullDraft({ title: 'Second of two', slug: 'same-address' })).expect(200);
      const results = await Promise.all([a, b].map((x) => api('post', `/admin/articles/${x.id}/publish`).send({ draftVersion: 2 })));
      expect(results.map((r) => r.status).sort()).toEqual([200, expect.any(Number)]);
      const loser = results.find((r) => r.status !== 200);
      expect([409, 422]).toContain(loser.status);
      expect(['SLUG_TAKEN', 'PUBLISH_CHECKLIST']).toContain(loser.body.error.code);
      expect(JSON.stringify(loser.body.error)).toMatch(/web address/);
    });
  });
});
