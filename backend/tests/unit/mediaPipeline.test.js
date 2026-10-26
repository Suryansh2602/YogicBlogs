// Image pipeline, storage keys and the work queue, attacked with files built inside the test.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { crc32 } from 'node:zlib';
import sharp from 'sharp';
import { ImageRejectedError, processImage } from '../../src/modules/media/imagePipeline.js';
import { createLocalStorage } from '../../src/services/storage.js';
import { createWorkQueue } from '../../src/utils/workQueue.js';

let dir;
const file = (name) => join(dir, name);

/** A real (tiny) PNG whose header lies about its size: a "decompression bomb" probe. */
async function pngClaiming(width, height) {
  const png = await sharp({ create: { width: 8, height: 8, channels: 3, background: '#000' } }).png().toBuffer();
  // IHDR is the first chunk: length(4) type(4) at offset 8, then width at 16, height at 20, CRC at 29.
  png.writeUInt32BE(width, 16);
  png.writeUInt32BE(height, 20);
  png.writeUInt32BE(crc32(png.subarray(12, 29)) >>> 0, 29);
  return png;
}

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), 'hm-media-'));
});

afterAll(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe('image pipeline', () => {
  it('makes WebP renditions at 480/960/1600 px (never upscaled) and a tiny placeholder', async () => {
    await sharp({ create: { width: 3000, height: 2000, channels: 3, background: '#e8728f' } }).jpeg().toFile(file('big.jpg'));
    const out = await processImage(file('big.jpg'));
    expect(out).toMatchObject({ width: 3000, height: 2000 });
    expect(out.variants.map((v) => v.width)).toEqual([480, 960, 1600]);
    for (const v of out.variants) expect((await sharp(v.data).metadata()).format).toBe('webp');
    expect(out.placeholder).toMatch(/^data:image\/webp;base64,/);
    expect(out.placeholder.length).toBeLessThan(700);

    await sharp({ create: { width: 300, height: 200, channels: 3, background: '#12807f' } }).png().toFile(file('small.png'));
    expect((await processImage(file('small.png'))).variants.map((v) => v.width)).toEqual([300]);
  });

  it('keeps transparency in renditions, but makes a solid placeholder that never shows through', async () => {
    await sharp({ create: { width: 600, height: 400, channels: 4, background: { r: 18, g: 128, b: 127, alpha: 0 } } }).png().toFile(file('clear.png'));
    const out = await processImage(file('clear.png'));
    expect((await sharp(out.variants[0].data).metadata()).hasAlpha).toBe(true);
    const tiny = Buffer.from(out.placeholder.split(',')[1], 'base64');
    expect((await sharp(tiny).metadata()).hasAlpha).toBe(false);
  });

  it('accepts an animated PNG (APNG) and uses its first frame', async () => {
    const apng = await sharp({ create: { width: 64, height: 64, channels: 3, background: '#e8728f' } }).png().toBuffer();
    // An "acTL" chunk right after IHDR is what makes a PNG animated; one frame is enough for the check.
    const actl = Buffer.alloc(8);
    actl.writeUInt32BE(1, 0);
    const len = Buffer.alloc(4);
    len.writeUInt32BE(8);
    const body = Buffer.concat([Buffer.from('acTL'), actl]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(body) >>> 0);
    await writeFile(file('anim.png'), Buffer.concat([apng.subarray(0, 33), len, body, crc, apng.subarray(33)]));
    const out = await processImage(file('anim.png'));
    expect(out).toMatchObject({ width: 64, height: 64 });
  });

  it('removes EXIF metadata, including GPS location, from photos', async () => {
    await sharp({ create: { width: 800, height: 600, channels: 3, background: '#f2a33a' } })
      .jpeg()
      .withExif({ IFD0: { Make: 'PhoneCo', Model: 'Camera 9' }, IFD3: { GPSLatitudeRef: 'N', GPSLatitude: '12/1 58/1 0/1', GPSLongitudeRef: 'E', GPSLongitude: '77/1 35/1 0/1' } })
      .toFile(file('gps.jpg'));
    expect((await sharp(file('gps.jpg')).metadata()).exif).toBeDefined(); // the input really has EXIF
    const out = await processImage(file('gps.jpg'));
    for (const v of out.variants) {
      const meta = await sharp(v.data).metadata();
      expect(meta.exif).toBeUndefined();
      expect(meta.xmp).toBeUndefined();
      expect(v.data.includes(Buffer.from('PhoneCo'))).toBe(false);
    }
  });

  it('applies the camera rotation so portrait photos stay upright', async () => {
    await sharp({ create: { width: 1200, height: 800, channels: 3, background: '#1f2b5e' } }).jpeg().withMetadata({ orientation: 6 }).toFile(file('rotated.jpg'));
    const out = await processImage(file('rotated.jpg'));
    expect(out).toMatchObject({ width: 800, height: 1200 });
    expect(out.variants.at(-1)).toMatchObject({ width: 800, height: 1200 });
  });

  it('drops anything hidden in a polyglot file (a JPEG with HTML/script appended)', async () => {
    const jpeg = await sharp({ create: { width: 640, height: 480, channels: 3, background: '#fbf6ef' } }).jpeg().toBuffer();
    await writeFile(file('polyglot.jpg'), Buffer.concat([jpeg, Buffer.from('<html><script>alert(document.cookie)</script></html>')]));
    const out = await processImage(file('polyglot.jpg'));
    for (const v of out.variants) {
      expect(v.data.includes(Buffer.from('<script'))).toBe(false);
      expect(v.data.includes(Buffer.from('<html'))).toBe(false);
    }
  });

  it.each([
    [50_000, 50_000, '50000 × 50000'], // both sides over the limit
    [12_000, 100, '12000 × 100'], // one side over
    [9_000, 9_000, '9000 × 9000'], // sides fine, 81 megapixels over the 40 MP cap
  ])('refuses a decompression bomb claiming %i × %i from its header, without decoding it', async (w, h, shown) => {
    await writeFile(file('bomb.png'), await pngClaiming(w, h));
    const err = await processImage(file('bomb.png')).catch((e) => e);
    expect(err).toBeInstanceOf(ImageRejectedError);
    expect(err.code).toBe('IMAGE_TOO_LARGE');
    expect(err.message).toContain(`${shown} pixels`);
  });

  it('refuses files that are not images, with a plain reason', async () => {
    await writeFile(file('fake.jpg'), 'this is just text pretending to be a photo');
    const err = await processImage(file('fake.jpg')).catch((e) => e);
    expect(err).toBeInstanceOf(ImageRejectedError);
    expect(err.code).toBe('IMAGE_UNREADABLE');
  });
});

describe('local storage', () => {
  it('writes and reads server-made keys inside the storage root', async () => {
    const storage = createLocalStorage(join(dir, 'store'));
    await storage.put('images/2026/10/abc-480.webp', Buffer.from('webp-bytes'));
    expect(await readFile(storage.pathFor('images/2026/10/abc-480.webp'), 'utf8')).toBe('webp-bytes');
    expect(await storage.size('images/2026/10/abc-480.webp')).toBe(10);
    await storage.remove('images/2026/10/abc-480.webp');
    expect(await storage.freeBytes()).toBeGreaterThan(0);
  });

  it.each(['../secrets.txt', 'images/../../etc/passwd', '/etc/passwd', 'images\\..\\x', 'Images/X.webp', 'images/', ''])('refuses the unsafe key %j', (key) => {
    const storage = createLocalStorage(join(dir, 'store'));
    expect(() => storage.pathFor(key)).toThrow(/Unsafe storage key|escapes/);
  });
});

describe('work queue', () => {
  it('runs one task at a time and answers 503 + Retry-After when too many are waiting', async () => {
    const queue = createWorkQueue({ concurrency: 1, maxWaiting: 2, retryAfterSeconds: 7 });
    let release;
    const gate = new Promise((r) => {
      release = r;
    });
    const order = [];
    const first = queue.run(async () => {
      order.push('first');
      await gate;
    });
    const second = queue.run(async () => order.push('second'));
    const third = queue.run(async () => order.push('third'));
    expect(queue.stats).toEqual({ running: 1, waiting: 2 });
    const refused = await queue.run(async () => order.push('fourth')).catch((e) => e);
    expect(refused).toMatchObject({ statusCode: 503, code: 'BUSY', retryAfter: 7 });
    release();
    await Promise.all([first, second, third]);
    expect(order).toEqual(['first', 'second', 'third']);
  });

  it('keeps going after a task fails', async () => {
    const queue = createWorkQueue();
    await expect(queue.run(async () => Promise.reject(new Error('boom')))).rejects.toThrow('boom');
    await expect(queue.run(async () => 'ok')).resolves.toBe('ok');
  });
});
