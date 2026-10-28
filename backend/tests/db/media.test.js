// Media library through the real HTTP app and MySQL: admin-only image upload (and the attacks on it),
// de-duplication, the public image route, alt text, delete protection and auditing.
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import http from 'node:http';
import { readdir, rm, stat } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { crc32 } from 'node:zlib';
import request from 'supertest';
import sharp from 'sharp';

const { createApp } = await import('../../src/app.js');
const { closeDatabase, models } = await import('../../src/config/db.js');
const { env } = await import('../../src/config/env.js');
const { storage } = await import('../../src/services/storage.js');
const { forgetImageLookup, imageQueueStats } = await import('../../src/modules/media/media.service.js');
const { signAccessToken } = await import('../../src/modules/auth/token.service.js');
const { connectAsMigrator, resetTables } = await import('./helpers.js');

let seq = 0;
async function tokenFor(role, { otp = true } = {}) {
  seq += 1;
  const user = await models.User.create({ email: `media-${role}${seq}@example.com`, displayName: `${role} ${seq}`, role, emailVerifiedAt: new Date() });
  return `Bearer ${await signAccessToken(user, { sid: `sid-m${seq}`, amr: otp ? ['pwd', 'otp'] : ['pwd'] })}`;
}

const photo = (width = 1200, height = 800, color = '#e8728f') => sharp({ create: { width, height, channels: 3, background: color } }).jpeg().toBuffer();
const tmpDir = join(resolve(env.UPLOAD_DIR), 'tmp');
const tempFiles = async () => (await readdir(tmpDir).catch(() => [])).filter((f) => f.endsWith('.upload'));

describe('media library (real database)', () => {
  let app;
  let migrator;
  let admin;

  beforeAll(async () => {
    migrator = connectAsMigrator();
    app = createApp();
  });

  beforeEach(async () => {
    await resetTables(migrator);
    await rm(resolve(env.UPLOAD_DIR, 'images'), { recursive: true, force: true });
    admin = await tokenFor('admin');
  });

  afterAll(async () => {
    await Promise.all([migrator.close(), closeDatabase()]);
    await rm(resolve(env.UPLOAD_DIR), { recursive: true, force: true });
  });

  const upload = (buffer, filename = 'photo.jpg', { auth = admin, altText } = {}) => {
    const req = request(app).post('/api/v1/admin/media/images').set('Authorization', auth);
    if (altText !== undefined) req.field('altText', altText);
    return req.attach('file', buffer, filename);
  };
  const auditActions = async () => (await migrator.query(`SELECT action FROM \`${env.AUDIT_DB_NAME}\`.audit_logs`))[0].map((a) => a.action);

  describe('access', () => {
    it('needs a signed-in admin whose session passed 2FA, for every route', async () => {
      const image = await photo(200, 200);
      await request(app).post('/api/v1/admin/media/images').attach('file', image, 'a.jpg').expect(401);
      await request(app).get('/api/v1/admin/media').expect(401);
      const member = await upload(image, 'a.jpg', { auth: await tokenFor('user') }).expect(403);
      expect(member.body.error.code).toBe('FORBIDDEN');
      const noOtp = await upload(image, 'a.jpg', { auth: await tokenFor('admin', { otp: false }) }).expect(403);
      expect(noOtp.body.error.code).toBe('MFA_REQUIRED');
      expect(await models.Media.count()).toBe(0);
    });
  });

  describe('upload', () => {
    it('stores a photo as WebP renditions without its GPS location, and audits it', async () => {
      const withGps = await sharp(await photo(2400, 1600))
        .withExif({ IFD0: { Make: 'PhoneCo' }, IFD3: { GPSLatitudeRef: 'N', GPSLatitude: '12/1 58/1 0/1' } })
        .jpeg()
        .toBuffer();
      const res = await upload(withGps, 'IMG_2041.jpg', { altText: '  Child’s pose on a mat  ' }).expect(201);
      expect(res.body.deduplicated).toBe(false);
      expect(res.body.media).toMatchObject({ kind: 'image', status: 'ready', width: 2400, height: 1600, altText: 'Child’s pose on a mat', originalName: 'IMG_2041.jpg' });
      expect(res.body.media.variants.map((v) => v.width)).toEqual([480, 960, 1600]);
      expect(res.body.media.variants[0].url).toBe(`/media/i/${res.body.media.id}/480`);
      expect(res.body.media.placeholder).toMatch(/^data:image\/webp;base64,/);

      const served = await request(app).get(`/api/v1${res.body.media.variants[2].url}`).buffer(true).expect(200);
      const meta = await sharp(served.body).metadata();
      expect(meta).toMatchObject({ format: 'webp', width: 1600, height: 1067 });
      expect(meta.exif).toBeUndefined();
      expect(served.body.includes(Buffer.from('PhoneCo'))).toBe(false);

      const row = await models.Media.findByPk(res.body.media.id);
      expect(row).toMatchObject({ mimeType: 'image/webp', visibility: 'public', storageBackend: 'local', sizeBytes: withGps.length });
      expect(row.storageKey).toMatch(/^images\/\d{4}\/\d{2}\/[0-9a-f-]{36}-1600\.webp$/);
      expect(await auditActions()).toContain('media.uploaded');
      expect(await tempFiles()).toEqual([]);
    });

    it('accepts PNG and WebP, and never upscales a small image', async () => {
      const png = await sharp({ create: { width: 300, height: 120, channels: 4, background: '#12807f80' } }).png().toBuffer();
      const res = await upload(png, 'logo.png').expect(201);
      expect(res.body.media.variants).toEqual([{ width: 300, height: 120, url: `/media/i/${res.body.media.id}/300` }]);
      await request(app).get(`/api/v1/media/i/${res.body.media.id}/300`).expect(200);
      const webp = await sharp(await photo(640, 640, '#1f2b5e')).webp().toBuffer();
      await upload(webp, 'square.webp').expect(201);
    });

    it('returns the existing image when the same file is uploaded again (no duplicate files)', async () => {
      const image = await photo(800, 600);
      const first = await upload(image, 'one.jpg').expect(201);
      const again = await upload(image, 'copy-of-one.jpg').expect(200);
      expect(again.body).toMatchObject({ deduplicated: true, media: { id: first.body.media.id } });
      expect(await models.Media.count()).toBe(1);
      expect(await tempFiles()).toEqual([]);
    });

    it('keeps only a safe display name from a path-traversal file name; storage names are made by the server', async () => {
      const res = await upload(await photo(400, 300), '..\\..\\..\\windows\\evil name.jpg').expect(201);
      expect(res.body.media.originalName).toBe('evil name.jpg');
      const row = await models.Media.findByPk(res.body.media.id);
      expect(row.storageKey).not.toMatch(/evil|\.\./);
    });

    it('refuses a file name with control characters as a malformed upload (400, not a crash)', async () => {
      const res = await upload(await photo(400, 300), 'evil\u0007name.jpg').expect(400);
      expect(res.body.error).toMatchObject({ code: 'UPLOAD_INVALID', message: 'This upload is damaged or incomplete. Try again.' });
      expect(await tempFiles()).toEqual([]);
    });

    it('says what is missing when no file is sent', async () => {
      const res = await request(app).post('/api/v1/admin/media/images').set('Authorization', admin).send({ altText: 'x' }).expect(400);
      expect(res.body.error).toMatchObject({ code: 'NO_FILE', message: 'Choose an image to upload (send it in a field named "file").' });
    });
  });

  describe('upload attacks', () => {
    const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"><script>alert(document.cookie)</script></svg>');
    const gif = Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64');
    const pdf = Buffer.from('%PDF-1.7\n1 0 obj << /Type /Catalog >> endobj\ntrailer << /Root 1 0 R >>\n%%EOF');

    it.each([
      ['an SVG with a script, named .jpg', svg, 'logo.jpg', /This file is an SVG drawing\. SVGs can carry scripts/],
      ['an SVG with its real name', svg, 'logo.svg', /export it as PNG and upload that\./],
      ['a GIF', gif, 'anim.gif', /This file is a GIF\. Upload a JPEG, PNG or WebP image instead\./],
      ['a PDF named .png', pdf, 'scan.png', /This file is a PDF\./],
      ['an HTML page named .jpg', Buffer.from('<!doctype html><html><body><script>alert(1)</script></body></html>'), 'cat.jpg', /isn’t a JPEG, PNG or WebP image: its contents don’t match any image format/],
      ['plain text named .webp', Buffer.from('just some words'), 'notes.webp', /isn’t a JPEG, PNG or WebP image: its contents don’t match any image format/],
    ])('refuses %s from its contents, whatever its name (415)', async (_label, buffer, filename, message) => {
      const res = await upload(buffer, filename).expect(415);
      expect(res.body.error.code).toBe('UNSUPPORTED_FILE_TYPE');
      expect(res.body.error.message).toMatch(message);
      expect(await models.Media.count()).toBe(0);
      expect(await tempFiles()).toEqual([]);
    });

    it('accepts a JPEG with HTML/script glued on, but serves only clean re-encoded pixels', async () => {
      const polyglot = Buffer.concat([await photo(640, 480), Buffer.from('<html><script>alert(document.cookie)</script></html>')]);
      const res = await upload(polyglot, 'polyglot.jpg').expect(201);
      const served = await request(app).get(`/api/v1/media/i/${res.body.media.id}/480`).buffer(true).expect(200);
      expect(served.body.includes(Buffer.from('<script'))).toBe(false);
    });

    it('refuses a decompression bomb from its header and names its size (422)', async () => {
      const png = await sharp({ create: { width: 8, height: 8, channels: 3, background: '#000' } }).png().toBuffer();
      png.writeUInt32BE(60_000, 16);
      png.writeUInt32BE(60_000, 20);
      png.writeUInt32BE(crc32(png.subarray(12, 29)) >>> 0, 29);
      const res = await upload(png, 'bomb.png').expect(422);
      expect(res.body.error).toMatchObject({ code: 'IMAGE_TOO_LARGE' });
      expect(res.body.error.message).toContain('60000 × 60000 pixels');
      expect(await tempFiles()).toEqual([]);
    });

    it('refuses a declared 1 GB upload from its headers, without reading the body (413)', async () => {
      // Promise 1 GB, send a few bytes, and read the reply: it must come back without the body.
      const res = await new Promise((resolvePromise, reject) => {
        const server = app.listen(0, () => {
          const req = http.request(
            {
              port: server.address().port,
              method: 'POST',
              path: '/api/v1/admin/media/images',
              headers: { Authorization: admin, 'Content-Type': 'multipart/form-data; boundary=x', 'Content-Length': String(1024 ** 3) },
            },
            (response) => {
              let body = '';
              response.on('data', (chunk) => (body += chunk));
              response.on('end', () => {
                req.destroy();
                server.close();
                resolvePromise({ status: response.statusCode, headers: response.headers, body: JSON.parse(body) });
              });
            },
          );
          req.on('error', (err) => (server.close(), reject(err)));
          req.write('--x\r\n');
        });
      });
      expect(res.status).toBe(413);
      expect(res.headers.connection).toBe('close');
      expect(res.body.error).toMatchObject({ code: 'FILE_TOO_LARGE', message: `This file is larger than ${env.MAX_IMAGE_MB} MB, the most an image can be. Resize or compress it and try again.` });
      expect(await tempFiles()).toEqual([]);
    });

    it('refuses several files, unknown fields, the wrong field name and over-long alt text, leaving nothing behind', async () => {
      const image = await photo(200, 200);
      const twoFiles = await request(app).post('/api/v1/admin/media/images').set('Authorization', admin).attach('file', image, 'a.jpg').attach('file', image, 'b.jpg').expect(400);
      expect(twoFiles.body.error.message).toBe('Upload one file at a time.');

      const wrongName = await request(app).post('/api/v1/admin/media/images').set('Authorization', admin).attach('image', image, 'a.jpg').expect(400);
      expect(wrongName.body.error.message).toBe('Send the image in a field named "file", and only one file.');

      const extraField = await request(app).post('/api/v1/admin/media/images').set('Authorization', admin).field('uploadedById', 'someone-else').attach('file', image, 'a.jpg').expect(400);
      expect(extraField.body.error.code).toBe('VALIDATION_FAILED');

      const twoFields = await request(app).post('/api/v1/admin/media/images').set('Authorization', admin).field('altText', 'a').field('status', 'ready').attach('file', image, 'a.jpg').expect(400);
      expect(twoFields.body.error.message).toBe('This upload has too many fields. Send just the image and its alt text.');

      const longAlt = await upload(image, 'a.jpg', { altText: 'x'.repeat(300) }).expect(400);
      expect(longAlt.body.error.details[0].message).toBe('The alt text has 300 characters. Keep it to 255.');

      expect(await models.Media.count()).toBe(0);
      expect(await tempFiles()).toEqual([]);
    });

    it('refuses a broken multipart body', async () => {
      const res = await request(app)
        .post('/api/v1/admin/media/images')
        .set('Authorization', admin)
        .set('Content-Type', 'multipart/form-data; boundary=xyz')
        .send('--xyz\r\nContent-Disposition: form-data; name="file"; filename="a.jpg"\r\n\r\npartial')
        .expect(400);
      expect(res.body.error.code).toBe('UPLOAD_INVALID');
      expect(await tempFiles()).toEqual([]);
    });

    it('limits each admin to 60 uploads an hour', async () => {
      const limited = createApp();
      const image = await photo(120, 120);
      const send = () => request(limited).post('/api/v1/admin/media/images').set('Authorization', admin).attach('file', image, 'a.jpg');
      for (let i = 0; i < 60; i += 1) expect([200, 201]).toContain((await send()).status);
      const refused = await send().expect(429);
      expect(refused.body.error.code).toBe('UPLOAD_LIMIT');
      // Another admin still can.
      await request(limited).post('/api/v1/admin/media/images').set('Authorization', await tokenFor('admin')).attach('file', image, 'a.jpg').expect(200);
    }, 60_000);
  });

  describe('public image route', () => {
    it('serves a rendition with long-cache, same-site and no-script headers, and answers 304 on revalidation', async () => {
      const { media } = (await upload(await photo(1000, 500)).expect(201)).body;
      const res = await request(app).get(`/api/v1/media/i/${media.id}/960`).expect(200);
      expect(res.headers).toMatchObject({
        'content-type': 'image/webp',
        'cache-control': 'public, max-age=31536000, immutable',
        'cross-origin-resource-policy': 'same-site',
        'content-security-policy': "default-src 'none'; sandbox",
        'x-content-type-options': 'nosniff',
        etag: `"${media.id}-960"`,
      });
      // Its own rate limit, not the general one (a page loads several images).
      expect(res.headers['ratelimit-policy']).toContain('1500');
      await request(app).get(`/api/v1/media/i/${media.id}/960`).set('If-None-Match', `"${media.id}-960"`).expect(304);
    });

    it('looks an image up in the database once, even in a burst, then answers from memory', async () => {
      const { media } = (await upload(await photo(1000, 500)).expect(201)).body;
      const lookups = vi.spyOn(models.Media, 'findOne');
      // 20 at once while nothing is cached yet (a stampede): they must share one query.
      const burst = await Promise.all(Array.from({ length: 20 }, () => request(app).get(`/api/v1/media/i/${media.id}/480`)));
      expect(burst.map((r) => r.status)).toEqual(Array(20).fill(200));
      for (let i = 0; i < 5; i += 1) await request(app).get(`/api/v1/media/i/${media.id}/480`).expect(200);
      await request(app).get(`/api/v1/media/i/${media.id}/960`).expect(200);
      expect(lookups).toHaveBeenCalledTimes(1);
    });

    it('answers a plain 404 for anything that is not a stored rendition', async () => {
      const { media } = (await upload(await photo(1000, 500)).expect(201)).body;
      for (const path of [
        `/media/i/${media.id}/1600`, // wider than the original: never made
        `/media/i/${media.id}/500`,
        `/media/i/${media.id}/0480`,
        `/media/i/${media.id}/99999`,
        `/media/i/${media.id}/..%2F..%2Fpasswd`,
        '/media/i/not-a-uuid/480',
        `/media/i/018f2a3c-0000-7000-8000-000000000000/480`,
      ]) {
        const res = await request(app).get(`/api/v1${path}`).expect(404);
        expect(res.body.error.message).toBe('Image not found');
      }
      await models.Media.update({ status: 'processing' }, { where: { id: media.id } });
      forgetImageLookup(media.id); // status changes go through the media service, which does this
      await request(app).get(`/api/v1/media/i/${media.id}/480`).expect(404);
    });
  });

  describe('robustness (found in review)', () => {
    const waitFor = async (check, ms = 5000) => {
      const until = Date.now() + ms;
      while (!(await check())) {
        if (Date.now() > until) throw new Error('condition not met in time');
        await new Promise((r) => setTimeout(r, 20));
      }
    };

    /** A public image row whose 480 rendition is a big file written straight to storage. */
    async function bigImage(bytes) {
      const id = '018f2a3c-0000-7000-8000-0000000000b1';
      const key = `images/test/${id}-480.webp`;
      await storage.put(key, bytes);
      await models.Media.create({
        id,
        kind: 'image',
        visibility: 'public',
        storageKey: key,
        variants: { 480: { key, height: 320, bytes: bytes.length } },
        mimeType: 'image/webp',
        sizeBytes: bytes.length,
        checksumSha256: 'b'.repeat(64),
      });
      return { id, key };
    }

    it('closes the file when a visitor abandons a download half way (no leaked file handles)', async () => {
      const { id } = await bigImage(Buffer.alloc(24 * 1024 * 1024, 7));
      const opened = vi.spyOn(storage, 'createReadStream');
      const server = app.listen(0);
      await new Promise((r) => server.once('listening', r));
      await new Promise((resolvePromise) => {
        const req = http.get({ port: server.address().port, path: `/api/v1/media/i/${id}/480` }, (res) => {
          res.pause(); // a slow reader: the server's side backs up, then the visitor leaves
          setTimeout(() => {
            req.destroy();
            resolvePromise();
          }, 150);
        });
        req.on('error', () => {});
      });
      const stream = opened.mock.results[0].value;
      await waitFor(() => stream.destroyed);
      server.close();
    });

    it('never caches a miss: a rendition whose file is gone is a 404 with no-store and no ETag', async () => {
      const { media } = (await upload(await photo(600, 400)).expect(201)).body;
      const row = await models.Media.findByPk(media.id);
      await rm(storage.pathFor(row.variants[480].key));
      const res = await request(app).get(`/api/v1/media/i/${media.id}/480`).expect(404);
      expect(res.headers['cache-control']).toBe('no-store');
      expect(res.headers.etag).not.toBe(`"${media.id}-480"`); // (Express's own weak ETag on the JSON error is fine)
      const malformed = await request(app).get('/api/v1/media/i/nope/480').expect(404);
      expect(malformed.headers['cache-control']).toBe('no-store');
    });

    it('answers 304 to weak and listed ETags too', async () => {
      const { media } = (await upload(await photo(600, 400)).expect(201)).body;
      const etag = `"${media.id}-480"`;
      await request(app).get(`/api/v1/media/i/${media.id}/480`).set('If-None-Match', `W/${etag}`).expect(304);
      await request(app).get(`/api/v1/media/i/${media.id}/480`).set('If-None-Match', `"other", ${etag}`).expect(304);
      await request(app).get(`/api/v1/media/i/${media.id}/480`).set('If-None-Match', '"other"').expect(200);
    });

    it('stores the same file once even when it is uploaded twice at the same moment', async () => {
      const image = await photo(900, 600, '#3a6b35');
      const [a, b] = await Promise.all([upload(image, 'a.jpg'), upload(image, 'b.jpg')]);
      expect([a.status, b.status].sort()).toEqual([200, 201]);
      expect(a.body.media.id).toBe(b.body.media.id);
      expect(await models.Media.count()).toBe(1);
    });

    it('fills in missing alt text from a duplicate upload (never overwrites it), and audits every upload', async () => {
      const image = await photo(500, 500, '#7a4b9c');
      const first = (await upload(image, 'a.jpg').expect(201)).body.media;
      const filled = await upload(image, 'a.jpg', { altText: 'Lotus pose' }).expect(200);
      expect(filled.body.media.altText).toBe('Lotus pose');
      const kept = await upload(image, 'a.jpg', { altText: 'Something else' }).expect(200);
      expect(kept.body.media.altText).toBe('Lotus pose');
      const [rows] = await migrator.query(`SELECT action, entity_id AS id, metadata FROM \`${env.AUDIT_DB_NAME}\`.audit_logs WHERE action = 'media.uploaded'`);
      expect(rows).toHaveLength(3);
      expect(rows.every((r) => r.id === first.id)).toBe(true);
      const meta = rows.map((r) => (typeof r.metadata === 'string' ? JSON.parse(r.metadata) : r.metadata));
      expect(meta.filter((m) => m.deduplicated)).toEqual([
        { kind: 'image', deduplicated: true, altTextApplied: true },
        { kind: 'image', deduplicated: true, altTextApplied: false },
      ]);
    });

    it('accepts an animated PNG (APNG): it is an ordinary .png', async () => {
      const png = await sharp({ create: { width: 64, height: 64, channels: 3, background: '#e8728f' } }).png().toBuffer();
      const chunk = Buffer.concat([Buffer.from('acTL'), Buffer.from([0, 0, 0, 1, 0, 0, 0, 0])]);
      const head = Buffer.alloc(4);
      head.writeUInt32BE(8);
      const crc = Buffer.alloc(4);
      crc.writeUInt32BE(crc32(chunk) >>> 0);
      const apng = Buffer.concat([png.subarray(0, 33), head, chunk, crc, png.subarray(33)]);
      await upload(apng, 'spinner.png').expect(201);
    });

    it('does not serve images that are not public', async () => {
      const { media } = (await upload(await photo(600, 400)).expect(201)).body;
      await models.Media.update({ visibility: 'protected' }, { where: { id: media.id } });
      forgetImageLookup(media.id);
      await request(app).get(`/api/v1/media/i/${media.id}/480`).expect(404);
    });

    it('refuses to delete a file an article uses as its audio', async () => {
      const { media } = (await upload(await photo(300, 300)).expect(201)).body;
      const condition = await models.Condition.create({ name: 'Stress', slug: 'stress' });
      await models.Article.create({ conditionId: condition.id, title: 'Breathing', slug: 'breathing', audioId: media.id });
      const res = await request(app).delete(`/api/v1/admin/media/${media.id}`).set('Authorization', admin).expect(409);
      expect(res.body.error).toMatchObject({ code: 'MEDIA_IN_USE', message: 'This file is used by 1 article. Remove it from there first.' });
    });

    it('removes everything it wrote when saving the record fails', async () => {
      vi.spyOn(models.Media, 'create').mockRejectedValueOnce(new Error('database went away'));
      await upload(await photo(1700, 900)).expect(500);
      const stored = await readdir(resolve(env.UPLOAD_DIR, 'images'), { recursive: true }).catch(() => []);
      expect(stored.filter((p) => p.endsWith('.webp'))).toEqual([]);
      expect(await tempFiles()).toEqual([]);
      expect(await models.Media.count()).toBe(0);
    });

    it('tells the 5th simultaneous upload to come back later (503 + Retry-After) and leaves no temp file', async () => {
      let release;
      const gate = new Promise((r) => {
        release = r;
      });
      const realPut = storage.put.bind(storage);
      vi.spyOn(storage, 'put').mockImplementation(async (...args) => {
        await gate; // hold the one running job inside the queue
        return realPut(...args);
      });
      const images = await Promise.all(['#101010', '#202020', '#303030', '#404040', '#505050'].map((c) => photo(200, 200, c)));
      // One runs (held at the gate) and three wait: the queue is then full.
      const first = upload(images[0], '0.jpg').then((r) => r);
      await waitFor(() => imageQueueStats().running === 1);
      const waiting = images.slice(1, 4).map((img, i) => upload(img, `${i + 1}.jpg`).then((r) => r));
      await waitFor(() => imageQueueStats().waiting === 3);

      const refused = await upload(images[4], '4.jpg').expect(503);
      expect(refused.body.error).toMatchObject({ code: 'BUSY' });
      expect(refused.headers['retry-after']).toBe('10');

      release();
      const done = await Promise.all([first, ...waiting]);
      expect(done.map((r) => r.status)).toEqual([201, 201, 201, 201]);
      expect(await tempFiles()).toEqual([]);
    }, 60_000);
  });

  describe('library, alt text and delete', () => {
    it('lists newest first with paging, and filters by kind', async () => {
      await upload(await photo(300, 300, '#111111'), 'first.jpg').expect(201);
      await upload(await photo(300, 300, '#222222'), 'second.jpg').expect(201);
      const res = await request(app).get('/api/v1/admin/media?pageSize=1').set('Authorization', admin).expect(200);
      expect(res.body).toMatchObject({ page: 1, pageSize: 1, total: 2 });
      expect(res.body.items[0].originalName).toBe('second.jpg');
      expect(res.headers['cache-control']).toBe('no-store');
      const audio = await request(app).get('/api/v1/admin/media?kind=audio').set('Authorization', admin).expect(200);
      expect(audio.body.total).toBe(0);
      await request(app).get('/api/v1/admin/media?kind=video&sort=size').set('Authorization', admin).expect(400);
    });

    it('edits alt text, and says exactly what is wrong', async () => {
      const { media } = (await upload(await photo(300, 300)).expect(201)).body;
      const res = await request(app).patch(`/api/v1/admin/media/${media.id}`).set('Authorization', admin).send({ altText: 'Sunrise over the ghats' }).expect(200);
      expect(res.body.media.altText).toBe('Sunrise over the ghats');
      await request(app).patch(`/api/v1/admin/media/${media.id}`).set('Authorization', admin).send({ altText: 'x', kind: 'audio' }).expect(400);
      const missing = await request(app).patch('/api/v1/admin/media/018f2a3c-0000-7000-8000-000000000000').set('Authorization', admin).send({ altText: 'x' }).expect(404);
      expect(missing.body.error.message).toBe('This file no longer exists. It may have been deleted.');
      const badId = await request(app).patch('/api/v1/admin/media/42').set('Authorization', admin).send({ altText: 'x' }).expect(400);
      expect(badId.body.error.details[0].message).toBe('This file link is not valid.');
      expect(await auditActions()).toContain('media.updated');
    });

    it('refuses to delete an image that articles or conditions use, and says where', async () => {
      const { media } = (await upload(await photo(300, 300)).expect(201)).body;
      const condition = await models.Condition.create({ name: 'Insomnia', slug: 'insomnia', heroImageId: media.id });
      await models.Article.create({ conditionId: condition.id, title: 'Evening routine', slug: 'evening-routine', coverImageId: media.id });
      await models.Article.create({ conditionId: condition.id, title: 'Warm milk', slug: 'warm-milk', coverImageId: media.id });
      const res = await request(app).delete(`/api/v1/admin/media/${media.id}`).set('Authorization', admin).expect(409);
      expect(res.body.error).toMatchObject({ code: 'MEDIA_IN_USE', message: 'This file is used by 2 articles and 1 condition. Remove it from them first.' });
      await request(app).get(`/api/v1/media/i/${media.id}/300`).expect(200);
    });

    it('deletes an unused image: its files go, its links stop working, and it is audited', async () => {
      const { media } = (await upload(await photo(1000, 700)).expect(201)).body;
      const row = await models.Media.findByPk(media.id);
      const keys = Object.values(row.variants).map((v) => v.key);
      await request(app).delete(`/api/v1/admin/media/${media.id}`).set('Authorization', admin).expect(204);
      for (const key of keys) await expect(stat(storage.pathFor(key))).rejects.toThrow();
      await request(app).get(`/api/v1/media/i/${media.id}/480`).expect(404);
      await request(app).delete(`/api/v1/admin/media/${media.id}`).set('Authorization', admin).expect(404);
      expect(await auditActions()).toContain('media.deleted');
      // Uploading the same file again works (the deleted row doesn't count as a duplicate).
      await upload(await photo(1000, 700)).expect(201);
    });
  });
});
