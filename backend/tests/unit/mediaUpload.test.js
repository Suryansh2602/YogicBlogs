// Upload guards on a bare Express app: size limits (declared and undeclared), the disk guard, and
// display-name cleaning. The full upload flow is tested against MySQL in tests/db/media.test.js.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mkdir, mkdtemp, readdir, rm, utimes, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import http from 'node:http';
import express from 'express';
import request from 'supertest';
import { cleanupStaleUploads, contentLengthGuard, diskGuard, singleImageUpload } from '../../src/modules/media/media.upload.js';
import { requestTimeoutFor } from '../../src/httpServer.js';
import { cleanOriginalName } from '../../src/modules/media/media.service.js';
import { errorHandler } from '../../src/middlewares/errorHandler.js';

let dir;
beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), 'hm-upload-'));
});
afterAll(async () => {
  await rm(dir, { recursive: true, force: true });
});

const appWith = (...middleware) => {
  const app = express();
  app.post('/upload', ...middleware, (req, res) => res.json({ size: req.file?.size ?? null, fields: req.body }));
  app.use(errorHandler);
  return app;
};

/** POST a body in 4 KB chunks with no Content-Length (Node then sends it chunked) and read the reply. */
function sendChunked(app, body, contentType) {
  return new Promise((resolvePromise, reject) => {
    const server = app.listen(0, () => {
      const req = http.request({ port: server.address().port, method: 'POST', path: '/upload', headers: { 'Content-Type': contentType } }, (response) => {
        let text = '';
        response.on('data', (chunk) => (text += chunk));
        response.on('end', () => {
          server.close();
          resolvePromise({ status: response.statusCode, headers: response.headers, body: JSON.parse(text) });
        });
      });
      req.on('error', (err) => (server.close(), reject(err)));
      for (let i = 0; i < body.length; i += 4096) req.write(body.subarray(i, i + 4096));
      req.end();
    });
  });
}

describe('size limits', () => {
  it('requires uploads to declare their size (411), so an undeclared one is never read', async () => {
    const tmp = join(dir, 'undeclared');
    const app = appWith(contentLengthGuard(1), singleImageUpload({ maxMb: 1, tmpDir: tmp }));
    const res = await sendChunked(app, Buffer.from('--x\r\n'), 'multipart/form-data; boundary=x');
    expect(res.status).toBe(411);
    expect(res.headers.connection).toBe('close');
    expect(res.body.error).toMatchObject({ code: 'LENGTH_REQUIRED', message: 'This upload didn’t say how large it is. Send it with a Content-Length header (browsers do this automatically).' });
  });

  it('second guard: multer stops an undeclared upload once it passes the limit, and removes the partial file', async () => {
    const tmp = join(dir, 'chunked');
    const app = appWith(singleImageUpload({ maxMb: 0.01, tmpDir: tmp })); // ~10 KB, without the precheck
    const boundary = 'hmboundary';
    const body = Buffer.concat([
      Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="big.jpg"\r\nContent-Type: image/jpeg\r\n\r\n`),
      Buffer.alloc(50 * 1024, 0xab),
      Buffer.from(`\r\n--${boundary}--\r\n`),
    ]);
    const res = await sendChunked(app, body, `multipart/form-data; boundary=${boundary}`);
    expect(res.status).toBe(413);
    expect(res.body.error.code).toBe('FILE_TOO_LARGE');
    expect((await readdir(tmp)).filter((f) => f.endsWith('.upload'))).toEqual([]);
  });

  it('treats a cancelled upload as the client going away (400), not a server error', async () => {
    const tmp = join(dir, 'aborted');
    const handled = new Promise((resolvePromise) => {
      const app = express();
      app.post('/upload', singleImageUpload({ maxMb: 1, tmpDir: tmp }), (_req, res) => res.json({}));
      app.use((err, _req, res, _next) => {
        resolvePromise(err);
        res.end();
      });
      const server = app.listen(0, () => {
        const req = http.request({
          port: server.address().port,
          method: 'POST',
          path: '/upload',
          headers: { 'Content-Type': 'multipart/form-data; boundary=x', 'Content-Length': '100000' },
        });
        req.on('error', () => {});
        req.write('--x\r\nContent-Disposition: form-data; name="file"; filename="a.jpg"\r\n\r\nsome bytes');
        setTimeout(() => {
          req.destroy(); // the admin closed the tab mid-upload
          setTimeout(() => server.close(), 50);
        }, 50);
      });
    });
    const err = await handled;
    expect(err).toMatchObject({ statusCode: 400, code: 'UPLOAD_ABORTED' });
    expect((await readdir(tmp)).filter((f) => f.endsWith('.upload'))).toEqual([]);
  });

  it('lets an upload within the limit through to the handler', async () => {
    const app = appWith(contentLengthGuard(1), singleImageUpload({ maxMb: 1, tmpDir: join(dir, 'ok') }));
    const res = await request(app).post('/upload').field('altText', 'hi').attach('file', Buffer.alloc(1000, 1), 'a.jpg').expect(200);
    expect(res.body).toEqual({ size: 1000, fields: { altText: 'hi' } });
  });
});

describe('disk guard', () => {
  it('pauses uploads (507) when the disk is nearly full', async () => {
    const nearlyFull = { freeBytes: async () => 100 * 1024 * 1024 };
    const res = await request(appWith(diskGuard({ storage: nearlyFull, minFreeMb: 2048 }))).post('/upload').expect(507);
    expect(res.body.error).toMatchObject({ code: 'STORAGE_FULL', message: 'The server is almost out of storage space, so uploads are paused. Please tell the site owner.' });
  });

  it('allows uploads when there is room, and reports a disk check failure as a server error', async () => {
    await request(appWith(diskGuard({ storage: { freeBytes: async () => 10 * 1024 ** 3 }, minFreeMb: 2048 }))).post('/upload').expect(200);
    const broken = { freeBytes: async () => Promise.reject(new Error('EIO')) };
    await request(appWith(diskGuard({ storage: broken, minFreeMb: 1 }))).post('/upload').expect(500);
  });
});

describe('display names', () => {
  it.each([
    ['IMG_2041.JPG', 'IMG_2041.JPG'],
    ['../../etc/passwd', 'passwd'],
    ['C:\\Users\\me\\Desktop\\pose.png', 'pose.png'],
    ['bell\u0007\u0000name\u007f.jpg', 'bellname.jpg'],
    ['   ', null],
    ['folder/', null],
    [undefined, null],
    ['a'.repeat(400), 'a'.repeat(255)],
  ])('%j → %j', (input, expected) => {
    expect(cleanOriginalName(input)).toBe(expected);
  });
});

describe('leftover upload files', () => {
  it('removes old temp uploads and half-written renditions, and leaves recent and finished files alone', async () => {
    const root = join(dir, 'sweep');
    await mkdir(join(root, 'tmp'), { recursive: true });
    await mkdir(join(root, 'images/2026/10'), { recursive: true });
    const old = Date.now() - 60 * 60 * 1000;
    const files = {
      oldUpload: join(root, 'tmp', 'aaa.upload'),
      oldPart: join(root, 'images/2026/10', 'x-480.webp.1a2b.part'),
      newUpload: join(root, 'tmp', 'bbb.upload'), // an upload in progress right now
      image: join(root, 'images/2026/10', 'x-480.webp'),
    };
    for (const path of Object.values(files)) await writeFile(path, 'x');
    for (const path of [files.oldUpload, files.oldPart, files.image]) await utimes(path, old / 1000, old / 1000);

    expect(await cleanupStaleUploads({ root })).toBe(2);
    const left = await readdir(root, { recursive: true });
    expect(left.map((p) => p.replaceAll('\\', '/')).sort()).toEqual(['images', 'images/2026', 'images/2026/10', 'images/2026/10/x-480.webp', 'tmp', 'tmp/bbb.upload']);
    expect(await cleanupStaleUploads({ root: join(dir, 'does-not-exist') })).toBe(0);
  });
});

describe('request timeout', () => {
  it('gives the largest upload time to arrive over a slow 1 Mbit/s uplink, never under 30 s', () => {
    expect(requestTimeoutFor(15)).toBe(150_000);
    expect(requestTimeoutFor(50)).toBe(430_000);
    expect(requestTimeoutFor(0.1)).toBe(31_000);
    expect(requestTimeoutFor(0)).toBe(30_000);
  });
});
