// Media library: image upload (sniff → dedupe → re-encode → store → record), listing, alt text, delete,
// and the lookup behind the public image route.
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { open, rm } from 'node:fs/promises';
import { fileTypeFromFile } from 'file-type';
import { v7 as uuidv7 } from 'uuid';
import { Op, QueryTypes, Transaction } from 'sequelize';
import { models, sequelize } from '../../config/db.js';
import { MEDIA_KIND, MEDIA_STATUS, MEDIA_VISIBILITY, STORAGE_BACKEND } from '../../config/constants.js';
import { ApiError } from '../../utils/ApiError.js';
import { createWorkQueue } from '../../utils/workQueue.js';
import { storage as defaultStorage } from '../../services/storage.js';
import { audit } from '../../services/audit.js';
import { env } from '../../config/env.js';
import { logger } from '../../utils/logger.js';
import { ImageRejectedError, processImage } from './imagePipeline.js';
import { uploadFieldsSchema } from './media.validation.js';

// APNG is an ordinary .png (animated): accepted, and its first frame is used.
const ALLOWED_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/apng', 'image/webp']);
// Formats people commonly try, named in the refusal so they know what to do.
const KNOWN_TYPES = {
  'image/gif': 'a GIF',
  'image/heic': 'an iPhone HEIC photo',
  'image/heif': 'an iPhone HEIF photo',
  'image/avif': 'an AVIF image',
  'image/bmp': 'a BMP image',
  'image/tiff': 'a TIFF image',
  'image/vnd.adobe.photoshop': 'a Photoshop file',
  'application/pdf': 'a PDF',
  'application/zip': 'a ZIP archive',
  'text/html': 'a web page',
};

// One image is processed at a time; a few may wait, the rest are told to retry (503 + Retry-After).
const imageQueue = createWorkQueue({ concurrency: 1, maxWaiting: 3, retryAfterSeconds: 10 });

/** { running, waiting } for the image queue (monitoring and tests). */
export const imageQueueStats = () => imageQueue.stats;

const IMAGE_URL = (id, width) => `/media/i/${id}/${width}`;

/** The API's view of a media row (paths are relative to the API base, e.g. /api/v1). */
export function toView(media) {
  const variants = Object.entries(media.variants ?? {})
    .map(([width, v]) => ({ width: Number(width), height: v.height, url: IMAGE_URL(media.id, width) }))
    .sort((a, b) => a.width - b.width);
  return {
    id: media.id,
    kind: media.kind,
    status: media.status,
    altText: media.altText ?? '',
    width: media.width,
    height: media.height,
    sizeBytes: media.sizeBytes,
    originalName: media.originalName,
    placeholder: media.placeholder,
    variants,
    createdAt: media.createdAt,
  };
}

function sha256OfFile(path) {
  return new Promise((resolvePromise, reject) => {
    const hash = createHash('sha256');
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- multer's random temp path
    createReadStream(path)
      .on('data', (chunk) => hash.update(chunk))
      .on('error', reject)
      .on('end', () => resolvePromise(hash.digest('hex')));
  });
}

/** The client's file name, only for display in the admin library: no paths or control characters. */
export function cleanOriginalName(name) {
  if (typeof name !== 'string') return null;
  // eslint-disable-next-line no-control-regex
  const base = name.split(/[\\/]/).pop().replace(/[\u0000-\u001f\u007f]/g, '').trim();
  return base ? base.slice(0, 255) : null;
}

/** SVG is text, so file-type can't name it; look for an <svg> tag near the start. */
async function looksLikeSvg(path) {
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- multer's random temp path
  const handle = await open(path, 'r');
  try {
    const { buffer, bytesRead } = await handle.read(Buffer.alloc(4096), 0, 4096, 0);
    return /<svg[\s>]/i.test(buffer.subarray(0, bytesRead).toString('utf8'));
  } finally {
    await handle.close();
  }
}

async function assertImageType(path) {
  const detected = await fileTypeFromFile(path);
  if (detected && ALLOWED_IMAGE_TYPES.has(detected.mime)) return;
  let message;
  if (detected) {
    message = KNOWN_TYPES[detected.mime]
      ? `This file is ${KNOWN_TYPES[detected.mime]}. Upload a JPEG, PNG or WebP image instead.`
      : `This file is in ${detected.ext.toUpperCase()} format (${detected.mime}). Upload a JPEG, PNG or WebP image instead.`;
  } else if (await looksLikeSvg(path)) {
    message = 'This file is an SVG drawing. SVGs can carry scripts, so they aren’t accepted: export it as PNG and upload that.';
  } else {
    message = 'This file isn’t a JPEG, PNG or WebP image: its contents don’t match any image format, whatever its name says.';
  }
  throw new ApiError(415, message, { detected: detected?.mime ?? null }, 'UNSUPPORTED_FILE_TYPE');
}

const findDuplicate = (checksum) => models.Media.findOne({ where: { checksumSha256: checksum, kind: MEDIA_KIND.IMAGE, status: MEDIA_STATUS.READY } });

/** Removing a file failed: keep going (the request's outcome doesn't depend on it), but say so. */
const removeQuietly = (storage, key) => storage.remove(key).catch((err) => logger.warn({ err, key }, 'Could not remove a media file; it is now an orphan'));

/** The same bytes are already stored: reuse them, fill in alt text if it had none, and audit the upload. */
async function reuseDuplicate(existing, altText, req) {
  const altTextApplied = Boolean(altText) && !existing.altText; // never overwrite alt text an admin wrote
  if (altTextApplied) await existing.update({ altText });
  await audit('media.uploaded', {
    req,
    actorId: req.auth.userId,
    entityType: 'media',
    entityId: existing.id,
    metadata: { kind: MEDIA_KIND.IMAGE, deduplicated: true, altTextApplied },
  });
  return { media: existing, deduplicated: true };
}

/**
 * Store an uploaded image (already on disk at `file.path`) with its multipart text fields.
 * Returns { media, deduplicated }. The temp file is always removed, whatever happens.
 */
export async function uploadImage(file, rawFields, req, { storage = defaultStorage, queue = imageQueue } = {}) {
  if (!file) throw ApiError.badRequest('Choose an image to upload (send it in a field named "file").', undefined, 'NO_FILE');
  const written = [];
  try {
    const { altText = '' } = uploadFieldsSchema.parse(rawFields ?? {});
    await assertImageType(file.path);
    const checksum = await sha256OfFile(file.path);

    // Quick check first, so a repeat upload doesn't wait in the queue.
    const known = await findDuplicate(checksum);
    if (known) return await reuseDuplicate(known, altText, req);

    // Processing, storing and recording run inside the one-at-a-time queue, so the duplicate check below
    // can't race another upload of the same file in this process.
    const result = await queue.run(async () => {
      const raced = await findDuplicate(checksum);
      if (raced) return { duplicate: raced };

      let processed;
      try {
        processed = await processImage(file.path);
      } catch (err) {
        if (err instanceof ImageRejectedError) throw new ApiError(422, err.message, undefined, err.code);
        throw err;
      }
      const id = uuidv7();
      const now = new Date();
      const folder = `images/${now.getUTCFullYear()}/${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
      const variants = {};
      for (const v of processed.variants) {
        const key = `${folder}/${id}-${v.width}.webp`;
        await storage.put(key, v.data);
        written.push(key);
        variants[v.width] = { key, height: v.height, bytes: v.data.length };
      }
      const media = await models.Media.create({
        id,
        uploadedById: req.auth.userId,
        kind: MEDIA_KIND.IMAGE,
        visibility: MEDIA_VISIBILITY.PUBLIC,
        storageKey: written.at(-1),
        storageBackend: STORAGE_BACKEND.LOCAL,
        variants,
        originalName: cleanOriginalName(file.originalname),
        mimeType: 'image/webp',
        sizeBytes: file.size,
        checksumSha256: checksum,
        width: processed.width,
        height: processed.height,
        altText: altText || null,
        status: MEDIA_STATUS.READY,
        placeholder: processed.placeholder,
      });
      written.length = 0; // stored for good
      return { media };
    });

    if (result.duplicate) return await reuseDuplicate(result.duplicate, altText, req);
    const { media } = result;
    await audit('media.uploaded', {
      req,
      actorId: req.auth.userId,
      entityType: 'media',
      entityId: media.id,
      metadata: { kind: MEDIA_KIND.IMAGE, sizeBytes: file.size, width: media.width, height: media.height },
    });
    return { media, deduplicated: false };
  } finally {
    // Anything written before a failure is removed, and the upload's temp file always is.
    await Promise.all([...written.map((key) => removeQuietly(storage, key)), rm(file.path, { force: true }).catch(() => {})]);
  }
}

export async function list({ page, pageSize, kind }) {
  const { rows, count } = await models.Media.findAndCountAll({
    where: { ...(kind && { kind }) },
    // created_at has 1-second precision; ids are UUIDv7 (time-ordered), so they break ties.
    order: [
      ['createdAt', 'DESC'],
      ['id', 'DESC'],
    ],
    limit: pageSize,
    offset: (page - 1) * pageSize,
  });
  // The upload limit travels with the list so the admin page checks files against the real setting.
  return { items: rows.map(toView), page, pageSize, total: count, limits: { maxImageMb: env.MAX_IMAGE_MB } };
}

async function findOr404(id) {
  const media = await models.Media.findByPk(id);
  if (!media) throw ApiError.notFound('This file no longer exists. It may have been deleted.');
  return media;
}

export async function update(id, { altText }, req) {
  const media = await findOr404(id);
  await media.update({ altText: altText || null });
  await audit('media.updated', { req, actorId: req.auth.userId, entityType: 'media', entityId: id, metadata: { fields: ['altText'] } });
  return media;
}

/** Where a media file is used, e.g. { articles: 2, conditions: 1 }. */
/**
 * Where a media file is used: articles (live copy or draft: cover, images in the text, narration) and
 * condition pages. Deleted articles don't count (their usage rows are removed with them).
 */
async function usage(id, transaction) {
  const [[{ n }], conditions] = await Promise.all([
    sequelize.query(
      `SELECT COUNT(DISTINCT u.article_id) AS n FROM article_media u JOIN articles a ON a.id = u.article_id
        WHERE u.media_id = :id AND a.deleted_at IS NULL`,
      { replacements: { id }, type: QueryTypes.SELECT, transaction },
    ),
    models.Condition.count({ where: { heroImageId: id }, transaction }),
  ]);
  // Older rows written before usage tracking (live cover/audio columns) still count.
  const legacy = await models.Article.count({ where: { [Op.or]: [{ coverImageId: id }, { audioId: id }] }, transaction });
  return { articles: Math.max(Number(n), legacy), conditions };
}

const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

export async function remove(id, req, { storage = defaultStorage } = {}) {
  // The media row is locked first: an article save or publish that wants to use it waits until this
  // decision is made (recording a use needs that row), so the check and the delete can't be split.
  const media = await sequelize.transaction(async (transaction) => {
    const row = await models.Media.findByPk(id, { transaction, lock: Transaction.LOCK.UPDATE });
    if (!row) throw ApiError.notFound('This file no longer exists. It may have been deleted.');
    const used = await usage(row.id, transaction);
    if (used.articles || used.conditions) {
      const where = [used.articles && plural(used.articles, 'article'), used.conditions && plural(used.conditions, 'condition')].filter(Boolean).join(' and ');
      throw new ApiError(409, `This file is used by ${where}. Remove it from ${used.articles + used.conditions === 1 ? 'there' : 'them'} first.`, used, 'MEDIA_IN_USE');
    }
    await row.destroy({ transaction });
    return row;
  });
  forgetImageLookup(id);
  // The row is kept (soft delete) for the audit trail; the files go.
  const keys = Object.values(media.variants ?? {}).map((v) => v.key);
  await Promise.all(keys.map((key) => removeQuietly(storage, key)));
  await audit('media.deleted', { req, actorId: req.auth.userId, entityType: 'media', entityId: id });
}

// Public image lookups, cached in this process: an article page asks for the same few images again and
// again. Bounded (oldest entries go first) and short-lived. Deleting an image clears its entry and
// removes its files, so a stale entry in another API process still ends in a 404, never a wrong image.
// Only found images are cached: a just-published image is never hidden by a cached "not found".
const LOOKUP_CACHE_MAX = 1000;
const LOOKUP_CACHE_TTL_MS = 60_000;
const lookupCache = new Map(); // id → { variants, expires }

export function forgetImageLookup(id) {
  lookupCache.delete(id);
}

// Lookups in progress: when many requests for the same uncached image arrive at once (a page just went
// viral, or the server restarted), they share one database query instead of queueing hundreds.
const lookupsInFlight = new Map(); // id → Promise<variants | null>

async function loadPublicVariants(id) {
  const media = await models.Media.findOne({
    where: { id, kind: MEDIA_KIND.IMAGE, visibility: MEDIA_VISIBILITY.PUBLIC, status: MEDIA_STATUS.READY },
    attributes: ['variants'],
  });
  if (!media) {
    lookupCache.delete(id);
    return null;
  }
  const variants = media.variants ?? {};
  lookupCache.delete(id); // re-insert so it counts as the newest
  lookupCache.set(id, { variants, expires: Date.now() + LOOKUP_CACHE_TTL_MS });
  if (lookupCache.size > LOOKUP_CACHE_MAX) lookupCache.delete(lookupCache.keys().next().value);
  return variants;
}

/** Storage key of a public, ready image rendition, or null. */
export async function publicImageKey(id, width) {
  const cached = lookupCache.get(id);
  if (cached && cached.expires > Date.now()) return cached.variants[width]?.key ?? null;

  let pending = lookupsInFlight.get(id);
  if (!pending) {
    pending = loadPublicVariants(id).finally(() => lookupsInFlight.delete(id));
    lookupsInFlight.set(id, pending);
  }
  const variants = await pending;
  return variants?.[width]?.key ?? null;
}
