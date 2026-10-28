// Upload guards for admin image uploads, in the order they run:
// 1. Content-Length precheck (413) – refuse an oversized upload before reading a byte of it.
// 2. Disk guard (507) – never fill the server's disk.
// 3. multer – multipart parsing straight to a temp file with hard limits (one file, few fields).
import { mkdirSync } from 'node:fs';
import { readdir, rm, stat } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { randomBytes } from 'node:crypto';
import multer from 'multer';
import { env } from '../../config/env.js';
import { ApiError } from '../../utils/ApiError.js';
import { storage as defaultStorage } from '../../services/storage.js';

const MB = 1024 * 1024;
// Multipart framing (boundaries, part headers, the alt-text field) on top of the file itself.
const MULTIPART_OVERHEAD = 64 * 1024;

const tooLarge = (maxMb) =>
  new ApiError(413, `This file is larger than ${maxMb} MB, the most an image can be. Resize or compress it and try again.`, undefined, 'FILE_TOO_LARGE');

/**
 * Uploads must declare their size (browsers always do), so an oversized one is refused before a byte
 * of it is read: 413 when too large, 411 when undeclared (a chunked body would otherwise be read up to
 * the limit first). The connection is closed after the reply, so the unread body is never drained.
 * multer's fileSize limit stays as a second guard.
 */
export const contentLengthGuard = (maxMb) => (req, res, next) => {
  const header = req.get('content-length');
  if (header === undefined) {
    res.set('Connection', 'close');
    return next(new ApiError(411, 'This upload didn’t say how large it is. Send it with a Content-Length header (browsers do this automatically).', undefined, 'LENGTH_REQUIRED'));
  }
  if (Number(header) > maxMb * MB + MULTIPART_OVERHEAD) {
    res.set('Connection', 'close');
    return next(tooLarge(maxMb));
  }
  next();
};

/** 507 when the disk is nearly full. */
export const diskGuard =
  ({ storage = defaultStorage, minFreeMb = env.MIN_FREE_DISK_MB } = {}) =>
  async (_req, _res, next) => {
    try {
      if ((await storage.freeBytes()) < minFreeMb * MB) {
        return next(new ApiError(507, 'The server is almost out of storage space, so uploads are paused. Please tell the site owner.', undefined, 'STORAGE_FULL'));
      }
      next();
    } catch (err) {
      next(err);
    }
  };

// What each multer limit means, in the admin's words.
const MULTER_MESSAGES = {
  LIMIT_FILE_SIZE: null, // → tooLarge()
  LIMIT_FILE_COUNT: 'Upload one file at a time.',
  LIMIT_UNEXPECTED_FILE: 'Send the image in a field named "file", and only one file.',
  LIMIT_PART_COUNT: 'This upload has too many parts. Send just the image and its alt text.',
  LIMIT_FIELD_COUNT: 'This upload has too many fields. Send just the image and its alt text.',
  LIMIT_FIELD_KEY: 'A field name in this upload is too long.',
  LIMIT_FIELD_VALUE: 'The alt text is too long. Keep it under 255 characters.',
  MISSING_FIELD_NAME: 'A field in this upload has no name.',
};

const STALE_AFTER_MS = 10 * 60 * 1000;

/**
 * Remove leftovers of uploads that never finished because the server crashed or restarted mid-request:
 * temp uploads (UPLOAD_DIR/tmp/*.upload) and half-written renditions (*.part). Only files older than
 * 10 minutes are touched, so uploads in progress are safe. Returns how many files were removed.
 */
export async function cleanupStaleUploads({ root = resolve(env.UPLOAD_DIR), olderThanMs = STALE_AFTER_MS, now = Date.now() } = {}) {
  let removed = 0;
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- server-configured directory
  const entries = await readdir(root, { recursive: true, withFileTypes: true }).catch(() => []);
  for (const entry of entries) {
    if (!entry.isFile() || !/\.(upload|part)$/.test(entry.name)) continue;
    const full = join(entry.parentPath, entry.name);
    try {
      // eslint-disable-next-line security/detect-non-literal-fs-filename -- found inside the storage root
      if (now - (await stat(full)).mtimeMs < olderThanMs) continue;
      await rm(full, { force: true });
      removed += 1;
    } catch {
      // Gone already (another process cleaned it up): nothing to do.
    }
  }
  return removed;
}

/**
 * Parse a multipart upload with exactly one file (field "file") and an optional "altText" field,
 * streamed to a randomly named temp file under UPLOAD_DIR/tmp (never the client's file name).
 */
export function singleImageUpload({ maxMb = env.MAX_IMAGE_MB, tmpDir = join(resolve(env.UPLOAD_DIR), 'tmp') } = {}) {
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- server-configured directory
  mkdirSync(tmpDir, { recursive: true });
  const parser = multer({
    storage: multer.diskStorage({
      destination: tmpDir,
      filename: (_req, _file, cb) => cb(null, `${randomBytes(16).toString('hex')}.upload`),
    }),
    limits: { fileSize: Math.floor(maxMb * MB), files: 1, fields: 1, fieldSize: 2048, parts: 2, headerPairs: 50, fieldNameSize: 32 },
  }).single('file');

  return (req, res, next) => {
    parser(req, res, (err) => {
      if (!err) return next();
      if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') return next(tooLarge(maxMb));
        return next(ApiError.badRequest(MULTER_MESSAGES[err.code] ?? 'This upload is not valid.', undefined, 'UPLOAD_INVALID'));
      }
      // The admin cancelled or the connection dropped: nobody is waiting for an answer, and it isn't a
      // server fault, so it must not be logged as one.
      // (Not req.destroyed: Node also sets that once a body has been read in full.)
      if (/^Request (aborted|closed)$/.test(err?.message ?? '')) {
        return next(ApiError.badRequest('The upload was interrupted before it finished.', undefined, 'UPLOAD_ABORTED'));
      }
      // busboy's errors for malformed input ("Malformed part header", "Unexpected end of form",
      // "Multipart: Boundary not found", "Unsupported content type"…). Disk errors stay 500.
      if (err?.message && /malformed|multipart|boundary|unexpected end of form|content type/i.test(err.message)) {
        return next(ApiError.badRequest('This upload is damaged or incomplete. Try again.', undefined, 'UPLOAD_INVALID'));
      }
      next(err);
    });
  };
}
