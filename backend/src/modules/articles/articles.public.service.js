// What readers can see: the list of published articles and a single article (full, or a teaser for a
// members article when signed out). Cached in Redis under a generation that every change bumps.
import { Op } from 'sequelize';
import { models, sequelize } from '../../config/db.js';
import { ACCESS_LEVEL, ARTICLE_STATUS } from '../../config/constants.js';
import { ApiError } from '../../utils/ApiError.js';
import { cache } from '../../utils/cache.js';
import { buildReaderPayload, imageView, liveContent, readyImages } from './articles.reader.js';
import { ARTICLES_CACHE } from './articles.admin.service.js';

const ARTICLE_TTL = 3600;
const LIST_TTL = 300;

const notFound = () => ApiError.notFound('This article doesn’t exist or isn’t published.');
const isLive = (a) => a.status === ARTICLE_STATUS.PUBLISHED && a.publishedAt && a.publishedAt <= new Date();

/** Read through the cache when Redis is up; build directly when it isn't (never serve stale). */
async function cached(key, ttl, build) {
  const gen = await cache.generation(ARTICLES_CACHE);
  if (gen === null) return build();
  return cache.getOrSet(`${ARTICLES_CACHE}:g${gen}:${key}`, ttl, build);
}

/**
 * One article by its address. Returns { payload } for readers, or { redirect } for an old address.
 * A members article is a teaser (no body) unless `signedIn`.
 */
export async function getBySlug(slug, { signedIn }) {
  // Every request asks the database (one indexed row) whether the article is live, so an unpublished
  // article stops being served at once, whatever the cache holds.
  const article = await models.Article.findOne({ where: { slug } });
  if (!article || !isLive(article)) {
    const old = await models.ArticleSlugRedirect.findByPk(slug, { attributes: ['articleId'] });
    if (old) {
      const target = await models.Article.findByPk(old.articleId, { attributes: ['slug', 'status', 'publishedAt'] });
      if (target && isLive(target)) return { redirect: target.slug };
    }
    throw notFound();
  }
  const teaser = article.accessLevel === ACCESS_LEVEL.MEMBERS && !signedIn;
  // Built from the same row that decided teaser/full and the cache key, never from a second read
  // (which could see a newer version with different access).
  const payload = await cached(`a:${article.id}:v${article.liveVersion}:${teaser ? 'teaser' : 'full'}`, ARTICLE_TTL, () =>
    buildReaderPayload(liveContent(article), { teaser }),
  );
  return { payload, accessLevel: article.accessLevel };
}

// Cursor = base64url of [publishedAt ISO, id]: stable paging even when new articles are published.
const encodeCursor = (a) => Buffer.from(JSON.stringify([a.publishedAt.toISOString(), a.id])).toString('base64url');
function decodeCursor(cursor) {
  try {
    const [at, id] = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
    const date = new Date(at);
    if (Number.isNaN(date.getTime()) || typeof id !== 'string' || !/^[0-9a-f-]{36}$/i.test(id)) throw new Error('bad');
    return { date, id };
  } catch {
    throw ApiError.badRequest('This page link is not valid. Go back to the first page.', undefined, 'BAD_CURSOR');
  }
}

/** Published cards, newest first; optional condition and full-text search. */
export async function listPublished({ condition, q, cursor, limit }) {
  // Only first pages are cached. Searches and later pages aren't: every different text or cursor
  // would be its own key, letting anyone fill Redis with made-up ones.
  const run = q || cursor ? (_key, _ttl, build) => build() : cached;
  return run(`list:${condition ?? ''}:${cursor ?? ''}:${limit}`, LIST_TTL, async () => {
    const where = { status: ARTICLE_STATUS.PUBLISHED, publishedAt: { [Op.lte]: new Date() } };
    if (cursor) {
      const { date, id } = decodeCursor(cursor);
      where[Op.and] = [{ [Op.or]: [{ publishedAt: { [Op.lt]: date } }, { publishedAt: date, id: { [Op.lt]: id } }] }];
    }
    if (q) {
      // Natural-language full-text search: no operators, so nothing in q can change the query.
      (where[Op.and] ??= []).push(sequelize.literal(`MATCH (\`Article\`.\`title\`, \`Article\`.\`summary\`, \`Article\`.\`content_text\`) AGAINST (${sequelize.escape(q)} IN NATURAL LANGUAGE MODE)`));
    }
    const include = [
      {
        model: models.Condition,
        as: 'condition',
        attributes: ['slug', 'name'],
        where: { isPublished: true, ...(condition && { slug: condition }) },
        required: true,
      },
    ];
    const rows = await models.Article.findAll({
      where,
      include,
      attributes: ['id', 'slug', 'title', 'summary', 'lang', 'cardAccent', 'accessLevel', 'coverImageId', 'coverAlt', 'coverFocalX', 'coverFocalY', 'readingMinutes', 'publishedAt'],
      order: [
        ['publishedAt', 'DESC'],
        ['id', 'DESC'],
      ],
      limit: limit + 1,
    });
    const page = rows.slice(0, limit);
    const covers = await readyImages(page.map((a) => a.coverImageId));
    return {
      items: page.map((a) => ({
        slug: a.slug,
        title: a.title,
        summary: a.summary,
        lang: a.lang,
        accent: a.cardAccent,
        accessLevel: a.accessLevel,
        condition: { slug: a.condition.slug, name: a.condition.name },
        cover: imageView(covers.get(a.coverImageId?.toLowerCase()), a.coverAlt),
        coverFocus: { x: a.coverFocalX, y: a.coverFocalY },
        readingMinutes: a.readingMinutes,
        publishedAt: a.publishedAt,
      })),
      nextCursor: rows.length > limit ? encodeCursor(page.at(-1)) : null,
    };
  });
}
