// The sitemap, and the site's index.html for the article pages. Both are kept in memory briefly: crawlers
// ask often, and a new article appearing in the sitemap ten minutes later does no harm.
import { readFile } from 'node:fs/promises';
import { QueryTypes } from 'sequelize';
import { env } from '../../config/env.js';
import { sequelize } from '../../config/db.js';
import { escapeHtml } from './seo.html.js';

const SITEMAP_TTL_MS = 10 * 60 * 1000;
const TEMPLATE_TTL_MS = 60 * 1000;
const MAX_ARTICLES = 5000;

const RITUS = ['shishira', 'vasanta', 'grishma', 'varsha', 'sharad', 'hemanta'];
const FIXED_PATHS = ['/', '/articles', '/ritucharya', '/ritucharya?lang=hi', ...RITUS.flatMap((ritu) => [`/ritucharya?ritu=${ritu}`, `/ritucharya?ritu=${ritu}&lang=hi`])];

const LIVE_ARTICLES_SQL = `SELECT slug, COALESCE(content_updated_at, published_at) AS lastmod FROM articles
  WHERE status = 'published' AND published_at <= NOW() AND deleted_at IS NULL
  ORDER BY published_at DESC LIMIT ${MAX_ARTICLES}`;

export const siteAddress = () => env.APP_URL.replace(/\/+$/, '');

const urlEntry = (site, path, lastmod) =>
  `<url><loc>${escapeHtml(`${site}${path}`)}</loc>${lastmod ? `<lastmod>${new Date(lastmod).toISOString()}</lastmod>` : ''}</url>`;

async function buildSitemap() {
  const site = siteAddress();
  const articles = await sequelize.query(LIVE_ARTICLES_SQL, { type: QueryTypes.SELECT });
  const entries = [...FIXED_PATHS.map((path) => urlEntry(site, path)), ...articles.map((a) => urlEntry(site, `/articles/${encodeURIComponent(a.slug)}`, a.lastmod))];
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${entries.join('')}</urlset>\n`;
}

let sitemap = { xml: null, expires: 0 };
let template = { html: null, expires: 0 };

export function clearSeoCache() {
  sitemap = { xml: null, expires: 0 };
  template = { html: null, expires: 0 };
}

export async function sitemapXml() {
  if (sitemap.xml && Date.now() < sitemap.expires) return sitemap.xml;
  sitemap = { xml: await buildSitemap(), expires: Date.now() + SITEMAP_TTL_MS };
  return sitemap.xml;
}

/** Re-read every minute, because a frontend deploy changes the file without restarting the API. */
export async function indexTemplate() {
  if (template.html && Date.now() < template.expires) return template.html;
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- server-configured path
  template = { html: await readFile(env.SITE_INDEX_HTML, 'utf8'), expires: Date.now() + TEMPLATE_TTL_MS };
  return template.html;
}
