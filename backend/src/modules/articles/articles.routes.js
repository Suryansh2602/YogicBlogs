import express, { Router } from 'express';
import { validate } from '../../middlewares/validate.js';
import { optionalAuthenticate } from '../../middlewares/authenticate.js';
import * as admin from './articles.admin.service.js';
import * as reader from './articles.public.service.js';
import {
  adminListQuery,
  articleIdParams,
  confirmSchema,
  createArticleSchema,
  deleteSchema,
  publicListQuery,
  revisionParams,
  saveDraftSchema,
  slugParams,
  versionOnlySchema,
} from './articles.validation.js';

/** Draft saves are the one place bodies may be up to 1 MB; app.js's 100 kB parser skips this route. */
export const isDraftSave = (req) => req.method === 'PUT' && /^\/api\/v1\/admin\/articles\/[^/?#]+\/draft(?:[?#]|$)/.test(req.originalUrl);

/**
 * Admin: mounted inside the admin router, after its authenticate → admin → 2FA gate, so the 1 MB parser
 * below only ever reads bodies from signed-in admins.
 * @param {{ autosaveLimiter: import('express').RequestHandler }} deps
 */
export function createAdminArticlesRouter({ autosaveLimiter }) {
  const router = Router();
  const noStore = (_req, res, next) => {
    res.set('Cache-Control', 'no-store');
    next();
  };
  router.use(noStore);

  router.get('/', validate({ query: adminListQuery }), async (req, res) => {
    res.json(await admin.listArticles(req.query));
  });
  router.post('/', validate({ body: createArticleSchema }), async (req, res) => {
    res.status(201).json(await admin.createArticle(req.body, req));
  });
  router.get('/:id', validate({ params: articleIdParams }), async (req, res) => {
    res.json(await admin.getArticle(req.params.id));
  });
  router.put('/:id/draft', autosaveLimiter, express.json({ limit: '1mb' }), validate({ params: articleIdParams, body: saveDraftSchema }), async (req, res) => {
    res.json(await admin.saveDraft(req.params.id, req.body, req));
  });
  router.get('/:id/checklist', validate({ params: articleIdParams }), async (req, res) => {
    res.json(await admin.getChecklist(req.params.id));
  });
  router.get('/:id/preview', validate({ params: articleIdParams }), async (req, res) => {
    res.json(await admin.preview(req.params.id));
  });
  router.post('/:id/publish', validate({ params: articleIdParams, body: versionOnlySchema }), async (req, res) => {
    res.json(await admin.publish(req.params.id, req.body, req));
  });
  router.post('/:id/unpublish', validate({ params: articleIdParams, body: confirmSchema }), async (req, res) => {
    res.json(await admin.unpublish(req.params.id, req.body, req));
  });
  router.post('/:id/archive', validate({ params: articleIdParams, body: confirmSchema }), async (req, res) => {
    res.json(await admin.archive(req.params.id, req.body, req));
  });
  router.post('/:id/discard-draft', validate({ params: articleIdParams, body: versionOnlySchema }), async (req, res) => {
    res.json(await admin.discardDraft(req.params.id, req.body, req));
  });
  router.delete('/:id', validate({ params: articleIdParams, body: deleteSchema }), async (req, res) => {
    await admin.removeArticle(req.params.id, req.body, req);
    res.status(204).end();
  });
  router.get('/:id/revisions', validate({ params: articleIdParams }), async (req, res) => {
    res.json(await admin.listRevisions(req.params.id));
  });
  router.post('/:id/revisions', validate({ params: articleIdParams }), async (req, res) => {
    res.status(201).json(await admin.saveManualRevision(req.params.id, req));
  });
  router.get('/:id/revisions/:revisionId', validate({ params: revisionParams }), async (req, res) => {
    res.json(await admin.getRevision(req.params.id, req.params.revisionId));
  });
  router.post('/:id/revisions/:revisionId/restore', validate({ params: revisionParams, body: versionOnlySchema }), async (req, res) => {
    res.json(await admin.restoreRevision(req.params.id, req.params.revisionId, req.body, req));
  });
  return router;
}

/** Public: anyone may list and open published articles; members articles show in full when signed in. */
export const publicArticlesRouter = Router();

publicArticlesRouter.get('/', validate({ query: publicListQuery }), async (req, res) => {
  const list = await reader.listPublished(req.query);
  res.set('Cache-Control', 'public, max-age=60'); // only once it worked: errors must never be cached
  res.json(list);
});

publicArticlesRouter.get('/:slug', optionalAuthenticate, async (req, res, next) => {
  // A malformed address isn't a route at all: the app's generic 404, with nothing echoed back.
  const parsed = slugParams.safeParse(req.params);
  if (!parsed.success) return next();
  const result = await reader.getBySlug(parsed.data.slug, { signedIn: Boolean(req.auth) });
  // The answer depends on who is asking: shared caches must not keep it, and browsers must re-ask.
  res.set('Vary', 'Authorization');
  if (result.redirect) {
    res.set('Cache-Control', 'public, max-age=300');
    return res.json({ redirect: result.redirect });
  }
  res.set('Cache-Control', result.accessLevel === 'public' ? 'public, max-age=60' : 'private, no-store');
  return res.json({ article: result.payload });
});
