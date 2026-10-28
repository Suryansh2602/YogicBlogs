// What a reader receives for an article, built the same way for the public page and the admin preview.
// Only published articles are ever named: links to anything else are plain text, cards and related
// entries for them are left out, and images whose file is gone are dropped.
import { Op } from 'sequelize';
import { models } from '../../config/db.js';
import { ARTICLE_STATUS, MEDIA_KIND, MEDIA_STATUS } from '../../config/constants.js';
import { collectReferences, readerBody } from './document.js';

const IMAGE_URL = (id, width) => `/media/i/${id}/${width}`;

/** A ready image, as readers need it. Alt text: the one given here, else the library's. */
export function imageView(media, alt = '') {
  if (!media) return null;
  return {
    alt: alt || media.altText || '',
    width: media.width,
    height: media.height,
    placeholder: media.placeholder,
    variants: Object.entries(media.variants ?? {})
      .map(([width, v]) => ({ width: Number(width), height: v.height, url: IMAGE_URL(media.id, width) }))
      .sort((a, b) => a.width - b.width),
  };
}

/** Ready, non-deleted images by id (lower-case). */
export async function readyImages(ids, { transaction, lock } = {}) {
  const list = [...new Set(ids.filter(Boolean).map((i) => i.toLowerCase()))];
  if (!list.length) return new Map();
  const rows = await models.Media.findAll({
    where: { id: list, kind: MEDIA_KIND.IMAGE, status: MEDIA_STATUS.READY },
    attributes: ['id', 'altText', 'width', 'height', 'placeholder', 'variants'],
    transaction,
    lock,
  });
  return new Map(rows.map((m) => [m.id.toLowerCase(), m]));
}

/** Published articles by id, as the small cards links and "Also read" blocks show. */
export async function publishedCards(ids) {
  const list = [...new Set([...ids].map((i) => i.toLowerCase()))];
  if (!list.length) return new Map();
  const rows = await models.Article.findAll({
    where: { id: list, status: ARTICLE_STATUS.PUBLISHED, publishedAt: { [Op.lte]: new Date() } },
    attributes: ['id', 'slug', 'title', 'summary', 'cardAccent', 'coverImageId', 'coverAlt', 'accessLevel'],
  });
  const covers = await readyImages(rows.map((r) => r.coverImageId));
  return new Map(
    rows.map((a) => [
      a.id.toLowerCase(),
      {
        slug: a.slug,
        title: a.title,
        summary: a.summary,
        accent: a.cardAccent,
        accessLevel: a.accessLevel,
        cover: imageView(covers.get(a.coverImageId?.toLowerCase()), a.coverAlt),
      },
    ]),
  );
}

/**
 * Build the reader payload from an article's content (live columns or a draft, same shape).
 * `teaser` leaves out the body: what a signed-out visitor sees of a members article.
 */
export async function buildReaderPayload(content, { teaser = false } = {}) {
  const condition = await models.Condition.findByPk(content.conditionId, { attributes: ['slug', 'name'] });
  const covers = await readyImages([content.cover.mediaId]);
  const base = {
    slug: content.slug,
    title: content.title,
    summary: content.summary,
    lang: content.lang,
    accent: content.accent,
    accessLevel: content.accessLevel,
    condition: condition ? { slug: condition.slug, name: condition.name } : null,
    cover: content.cover.mediaId ? imageView(covers.get(content.cover.mediaId.toLowerCase()), content.cover.alt) : null,
    coverFocus: { x: content.cover.focalX, y: content.cover.focalY },
    readingMinutes: content.readingMinutes,
    publishedAt: content.publishedAt ?? null,
    updatedAt: content.contentUpdatedAt ?? null,
    seo: { title: content.seoTitle || content.title, description: content.seoDescription || content.summary },
  };
  if (teaser) return { ...base, locked: true, reason: 'SIGN_IN_REQUIRED' };

  const refs = collectReferences(content.body);
  const related = (content.relatedIds ?? []).map((r) => r.toLowerCase());
  const [cards, images] = await Promise.all([publishedCards([...refs.links, ...refs.cards, ...related]), readyImages(refs.images.map((i) => i.mediaId))]);
  const body = readerBody(
    content.body,
    (articleId) => cards.has(articleId),
    (mediaId) => images.has(mediaId),
  );
  const imageAlt = new Map(refs.images.map((i) => [i.mediaId, i.alt]));
  return {
    ...base,
    locked: false,
    body,
    images: Object.fromEntries([...images].map(([mediaId, media]) => [mediaId, imageView(media, imageAlt.get(mediaId))])),
    articles: Object.fromEntries([...refs.links, ...refs.cards].filter((x) => cards.has(x)).map((x) => [x, cards.get(x)])),
    related: related.filter((x) => cards.has(x)).map((x) => cards.get(x)),
  };
}

/** The live columns of an article, in the same shape as a draft. */
export function liveContent(article) {
  return {
    slug: article.slug,
    title: article.title,
    summary: article.summary ?? '',
    conditionId: article.conditionId,
    accessLevel: article.accessLevel,
    lang: article.lang,
    accent: article.cardAccent,
    cover: { mediaId: article.coverImageId, alt: article.coverAlt ?? '', focalX: article.coverFocalX, focalY: article.coverFocalY },
    relatedIds: article.relatedIds ?? [],
    seoTitle: article.seoTitle ?? '',
    seoDescription: article.seoDescription ?? '',
    body: article.contentJson ?? { type: 'doc', content: [] },
    readingMinutes: article.readingMinutes ?? 1,
    publishedAt: article.publishedAt,
    contentUpdatedAt: article.contentUpdatedAt,
  };
}
