import { pipeline } from 'node:stream';
import { Router } from 'express';
import { validate } from '../../middlewares/validate.js';
import { ApiError } from '../../utils/ApiError.js';
import { storage } from '../../services/storage.js';
import { env } from '../../config/env.js';
import * as media from './media.service.js';
import { contentLengthGuard, diskGuard, singleImageUpload } from './media.upload.js';
import { imageParams, listMediaQuery, mediaIdParams, updateMediaSchema } from './media.validation.js';

/**
 * Admin media library: mounted inside the admin router, after its authenticate → admin → 2FA gate.
 * @param {{ uploadLimiter: import('express').RequestHandler }} deps per-admin upload rate limit
 */
export function createAdminMediaRouter({ uploadLimiter }) {
  const router = Router();

  router.get('/', validate({ query: listMediaQuery }), async (req, res) => {
    res.set('Cache-Control', 'no-store');
    res.json(await media.list(req.query));
  });

  router.post(
    '/images',
    uploadLimiter,
    contentLengthGuard(env.MAX_IMAGE_MB),
    diskGuard(),
    singleImageUpload(),
    async (req, res) => {
      const { media: item, deduplicated } = await media.uploadImage(req.file, req.body, req);
      res.status(deduplicated ? 200 : 201).json({ media: media.toView(item), deduplicated });
    },
  );

  router.patch('/:id', validate({ params: mediaIdParams, body: updateMediaSchema }), async (req, res) => {
    res.json({ media: media.toView(await media.update(req.params.id, req.body, req)) });
  });

  router.delete('/:id', validate({ params: mediaIdParams }), async (req, res) => {
    await media.remove(req.params.id, req);
    res.status(204).end();
  });

  return router;
}

const YEAR = 365 * 24 * 60 * 60;

/** Public image renditions. Mounted before the general API limiter, with its own (more generous) one. */
export const publicImageRouter = Router();
const notFound = (res, next) => {
  // Never cache a miss: the same URL may be valid a moment later (or was just deleted).
  for (const header of ['ETag', 'Content-Length', 'Content-Type']) res.removeHeader(header);
  res.set('Cache-Control', 'no-store');
  next(ApiError.notFound('Image not found'));
};

publicImageRouter.get('/:id/:width', async (req, res, next) => {
  res.set({
    // Shown by the site on a sibling origin (localhost:5173 ↔ :5000; healthmarg.com ↔ api.healthmarg.com).
    'Cross-Origin-Resource-Policy': 'same-site',
    // Even if someone opens the URL directly, nothing in it can run.
    'Content-Security-Policy': "default-src 'none'; sandbox",
  });
  const parsed = imageParams.safeParse(req.params);
  if (!parsed.success) return notFound(res, next);
  const key = await media.publicImageKey(parsed.data.id, parsed.data.width);
  if (!key) return notFound(res, next);

  let size;
  try {
    size = await storage.size(key);
  } catch (err) {
    return err.code === 'ENOENT' ? notFound(res, next) : next(err);
  }

  // A rendition never changes (new upload = new id), so browsers may keep it for a year.
  res.set({ 'Cache-Control': `public, max-age=${YEAR}, immutable`, ETag: `"${parsed.data.id}-${parsed.data.width}"` });
  // req.fresh compares If-None-Match properly (weak validators, lists, *).
  if (req.fresh) return res.status(304).end();

  res.type('image/webp').set('Content-Length', String(size));
  // pipeline (not pipe): if the client goes away mid-download, the file is closed instead of leaking.
  pipeline(storage.createReadStream(key), res, (err) => {
    if (!err || res.headersSent) return; // an abort after sending started: nothing left to answer
    if (err.code === 'ENOENT') notFound(res, next); // deleted between the size check and opening
    else next(err);
  });
});
