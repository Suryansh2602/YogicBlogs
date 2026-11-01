import { Router } from 'express';
import { env } from '../../config/env.js';
import { logger } from '../../utils/logger.js';
import { getBySlug } from '../articles/articles.public.service.js';
import { slugParams } from '../articles/articles.validation.js';
import { articlePage, missingPage } from './seo.html.js';
import { indexTemplate, siteAddress, sitemapXml } from './seo.service.js';

const API_PATH = '/api/v1';

/** The largest cover, else the site's own preview image. */
function previewImage(article, site) {
  const cover = article.cover?.variants?.at(-1);
  return cover && env.SITE_API_URL ? `${env.SITE_API_URL.replace(/\/+$/, '')}${API_PATH}${cover.url}` : `${site}/og-default.png`;
}

const sendPage = (res, status, html) => {
  if (env.SITE_CSP) res.set('Content-Security-Policy', env.SITE_CSP);
  res.status(status).set('Cache-Control', 'no-cache').type('html').send(html);
};

async function articleRoute(req, res, next) {
  let template;
  try {
    template = await indexTemplate();
  } catch (err) {
    next(err);
    return;
  }
  const slug = slugParams.safeParse({ slug: req.params.slug });
  if (!slug.success) {
    sendPage(res, 404, missingPage(template));
    return;
  }
  try {
    // Always the signed-out view: a members article stays a teaser, whoever is asking.
    const { payload, redirect } = await getBySlug(slug.data.slug, { signedIn: false });
    if (redirect) {
      res.redirect(301, `/articles/${encodeURIComponent(redirect)}`);
      return;
    }
    const site = siteAddress();
    sendPage(res, 200, articlePage(template, payload, { site, image: previewImage(payload, site) }));
  } catch (err) {
    if (err.statusCode === 404) {
      sendPage(res, 404, missingPage(template));
      return;
    }
    // The site's page still loads and explains; 503 tells crawlers to come back, not to drop the address.
    logger.error({ err, requestId: req.id }, 'Article page could not be built');
    res.set('Retry-After', '30');
    sendPage(res, 503, template);
  }
}

export function createSeoRouter() {
  const router = Router();
  router.get('/sitemap.xml', async (_req, res) => {
    res.set('Cache-Control', 'public, max-age=3600').type('application/xml').send(await sitemapXml());
  });
  if (env.SITE_INDEX_HTML) router.get('/articles/:slug', articleRoute);
  return router;
}
