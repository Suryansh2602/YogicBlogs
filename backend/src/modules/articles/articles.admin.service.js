// Admin side of articles: drafts (autosave with optimistic locking), the publish checklist, publishing,
// status changes, delete, and revisions. See docs/articles.md.
import { Op, QueryTypes, Transaction, UniqueConstraintError } from 'sequelize';
import { models, sequelize } from '../../config/db.js';
import {
  ACCESS_LEVEL,
  ARTICLE_MEDIA_ROLE,
  ARTICLE_STATUS,
  CACHE_GENERATION,
  CONTENT_SCOPE,
  REFERENCE_KIND,
  REVISION_REASON,
  SLUG_PATTERN,
} from '../../config/constants.js';
import { ApiError } from '../../utils/ApiError.js';
import { canonicalJson, contentHash } from '../../utils/canonicalJson.js';
import { ephemeralStore } from '../../utils/ephemeralStore.js';
import { cache } from '../../utils/cache.js';
import { audit } from '../../services/audit.js';
import { slugify } from '../conditions/conditions.service.js';
import { assertValidDocument, collectReferences, countWords, EMPTY_DOC, extractText, readingMinutes } from './document.js';
import { buildReaderPayload, readyImages } from './articles.reader.js';
import { draftSchema } from './articles.validation.js';

export const ARTICLES_CACHE = CACHE_GENERATION.ARTICLES; // bumped after every change readers can see
const AUTOSNAP_EVERY_MS = 10 * 60 * 1000;
const DRAFT_AUDIT_EVERY_SECONDS = 10 * 60;
const REVISION_CAPS = { [REVISION_REASON.AUTOSNAP]: 30, [REVISION_REASON.RESTORE]: 30, [REVISION_REASON.MANUAL]: 50 };
const MIN_WORDS = 50;

const lower = (id) => (id ? id.toLowerCase() : id);

// ── errors ─────────────────────────────────────────────────────────────────────────────────────
const notFound = () => ApiError.notFound('This article doesn’t exist.');
const gone = () => new ApiError(410, 'This article was deleted, so it can’t be saved. Your text is still in the editor: copy it into a new article.', undefined, 'ARTICLE_DELETED');

async function staleVersion(draft) {
  const by = draft.updatedById ? await models.User.findByPk(draft.updatedById, { attributes: ['displayName'] }) : null;
  return new ApiError(
    409,
    `Someone saved this article after you opened it${by ? ` (${by.displayName})` : ''}. Reload to see their changes before saving yours.`,
    { draftVersion: draft.draftVersion, savedAt: draft.updatedAt, savedBy: by?.displayName ?? null },
    'STALE_VERSION',
  );
}

/** Validate an incoming draft: shape (zod), body (allow-list), and that it doesn't relate to itself. */
export function normalizeDraft(raw, articleId) {
  const parsed = draftSchema.safeParse(raw);
  if (!parsed.success) {
    const details = parsed.error.issues.map(({ path, message }) => ({ path: ['draft', ...path].join('.'), message }));
    throw ApiError.badRequest('Validation failed', details, 'VALIDATION_FAILED');
  }
  const draft = parsed.data;
  assertValidDocument(draft.body);
  draft.conditionId = lower(draft.conditionId);
  draft.cover.mediaId = lower(draft.cover.mediaId);
  draft.relatedIds = draft.relatedIds.map(lower);
  if (articleId && draft.relatedIds.includes(lower(articleId))) {
    throw ApiError.badRequest('An article can’t be related to itself.', [{ path: 'draft.relatedIds', message: 'An article can’t be related to itself.' }], 'VALIDATION_FAILED');
  }
  return draft;
}

async function assertConditionExists(conditionId, path = 'draft.conditionId') {
  const condition = await models.Condition.findByPk(conditionId, { attributes: ['id'] });
  if (!condition) {
    const message = 'This condition no longer exists. Choose another one.';
    throw ApiError.badRequest(message, [{ path, message }], 'INVALID_REFERENCE');
  }
}

// ── references and media usage ─────────────────────────────────────────────────────────────────
/** Replace an article's reference and media rows for one scope (draft or live) in one language. */
async function rebuildUsage(articleId, langs, scope, draft, transaction) {
  const where = { lang: langs, scope };
  await models.ArticleReference.destroy({ where: { sourceArticleId: articleId, ...where }, transaction });
  await models.ArticleMedia.destroy({ where: { articleId, ...where }, transaction });

  const refs = collectReferences(draft.body);
  const lang = draft.lang;
  const references = [
    ...[...refs.links].map((t) => ({ kind: REFERENCE_KIND.LINK, targetArticleId: t })),
    ...[...refs.cards].map((t) => ({ kind: REFERENCE_KIND.CARD, targetArticleId: t })),
    ...draft.relatedIds.map((t) => ({ kind: REFERENCE_KIND.RELATED, targetArticleId: t })),
  ].map((r) => ({ ...r, sourceArticleId: articleId, lang, scope }));
  if (references.length) await models.ArticleReference.bulkCreate(references, { transaction, ignoreDuplicates: true });

  // Only media rows that exist can be recorded (foreign key); missing ones are caught by the checklist.
  const wanted = [
    ...(draft.cover.mediaId ? [{ role: ARTICLE_MEDIA_ROLE.COVER, mediaId: draft.cover.mediaId }] : []),
    ...refs.images.map((i) => ({ role: ARTICLE_MEDIA_ROLE.INLINE, mediaId: i.mediaId })),
  ];
  if (!wanted.length) return;
  const existing = await models.Media.findAll({ where: { id: [...new Set(wanted.map((w) => w.mediaId))] }, attributes: ['id'], paranoid: false, transaction });
  const ids = new Set(existing.map((m) => lower(m.id)));
  const rows = wanted.filter((w) => ids.has(w.mediaId)).map((w) => ({ ...w, articleId, lang, scope }));
  if (rows.length) await models.ArticleMedia.bulkCreate(rows, { transaction, ignoreDuplicates: true });
}

// ── revisions ──────────────────────────────────────────────────────────────────────────────────
async function addRevision(articleId, reason, draft, hash, userId, transaction) {
  if (reason !== REVISION_REASON.PUBLISH && reason !== REVISION_REASON.DELETE) {
    const newest = await models.ArticleRevision.findOne({ where: { articleId }, order: [['id', 'DESC']], attributes: ['snapshotHash'], transaction });
    // eslint-disable-next-line security/detect-possible-timing-attacks -- content hashes, not secrets
    if (newest?.snapshotHash === hash) return; // identical to the newest: nothing new to keep
  }
  await models.ArticleRevision.create(
    { articleId, reason, snapshot: draft, snapshotHash: hash, sizeBytes: Buffer.byteLength(canonicalJson(draft)), createdById: userId },
    { transaction },
  );
  const cap = REVISION_CAPS[reason];
  if (!cap) return; // publish and delete revisions are kept
  const keep = await models.ArticleRevision.findAll({ where: { articleId, reason }, order: [['id', 'DESC']], limit: cap, attributes: ['id'], transaction });
  if (keep.length === cap) {
    await models.ArticleRevision.destroy({ where: { articleId, reason, id: { [Op.lt]: keep.at(-1).id } }, transaction });
  }
}

// ── views ──────────────────────────────────────────────────────────────────────────────────────
const hasUnpublishedChanges = (article, draft) => article.liveHash !== null && article.liveHash !== draft.draftHash;

function listItem(article, draft, conditionNames) {
  const d = draft.draftJson;
  return {
    id: article.id,
    title: draft.draftTitle,
    status: article.status,
    hasUnpublishedChanges: hasUnpublishedChanges(article, draft),
    slug: article.slug,
    condition: { id: d.conditionId, name: conditionNames.get(d.conditionId) ?? null },
    accessLevel: d.accessLevel,
    lang: d.lang,
    coverMediaId: d.cover.mediaId,
    publishedAt: article.publishedAt,
    updatedAt: draft.updatedAt,
  };
}

/** Inbound links: published, non-deleted articles whose live copy points here (other than itself). */
async function inboundPublishedCount(articleId, transaction) {
  const [row] = await sequelize.query(
    `SELECT COUNT(DISTINCT r.source_article_id) AS n
       FROM article_references r JOIN articles a ON a.id = r.source_article_id
      WHERE r.target_article_id = :id AND r.scope = 'live' AND r.source_article_id <> :id
        AND a.status = 'published' AND a.deleted_at IS NULL`,
    { replacements: { id: articleId }, type: QueryTypes.SELECT, transaction },
  );
  return Number(row.n);
}

/** Each outbound reference of the draft, with the target's state (for the editor's links panel). */
async function outboundReferences(articleId) {
  const refs = await models.ArticleReference.findAll({ where: { sourceArticleId: articleId, scope: CONTENT_SCOPE.DRAFT }, attributes: ['kind', 'targetArticleId'] });
  if (!refs.length) return [];
  const targets = await models.Article.findAll({
    where: { id: [...new Set(refs.map((r) => r.targetArticleId))] },
    attributes: ['id', 'status', 'deletedAt'],
    include: [{ model: models.ArticleDraft, as: 'draft', attributes: ['draftTitle'] }],
    paranoid: false,
  });
  const byId = new Map(targets.map((t) => [lower(t.id), t]));
  return refs.map((r) => {
    const t = byId.get(lower(r.targetArticleId));
    const state = !t ? 'missing' : t.deletedAt ? 'deleted' : t.status;
    return { articleId: r.targetArticleId, kind: r.kind, title: t?.draft?.draftTitle ?? null, state };
  });
}

async function loadForAdmin(id, { transaction, lock } = {}) {
  const article = await models.Article.findByPk(id, { paranoid: false, transaction, lock });
  if (!article) throw notFound();
  const draft = await models.ArticleDraft.findByPk(article.id, { transaction, lock });
  if (!draft) throw notFound();
  return { article, draft };
}

export async function getArticle(id) {
  const { article, draft } = await loadForAdmin(id);
  if (article.deletedAt) throw notFound();
  const savedBy = draft.updatedById ? await models.User.findByPk(draft.updatedById, { attributes: ['displayName'] }) : null;
  const [references, inboundCount, checklist] = await Promise.all([outboundReferences(article.id), inboundPublishedCount(article.id), runChecklist(article, draft.draftJson)]);
  return {
    article: {
      id: article.id,
      status: article.status,
      slug: article.slug,
      publishedAt: article.publishedAt,
      contentUpdatedAt: article.contentUpdatedAt,
      liveVersion: article.liveVersion,
      draftVersion: draft.draftVersion,
      draft: draft.draftJson,
      savedAt: draft.updatedAt,
      savedBy: savedBy?.displayName ?? null,
      hasUnpublishedChanges: hasUnpublishedChanges(article, draft),
      references,
      inboundCount,
      checklist,
    },
  };
}

export async function listArticles({ page, pageSize, status, conditionId, q }) {
  const articleWhere = { ...(status && { status }) };
  const draftWhere = {
    ...(q && { draftTitle: { [Op.like]: `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%` } }),
    ...(conditionId && { [Op.and]: sequelize.where(sequelize.fn('JSON_UNQUOTE', sequelize.fn('JSON_EXTRACT', sequelize.col('draft_json'), '$.conditionId')), lower(conditionId)) }),
  };
  const { rows, count } = await models.ArticleDraft.findAndCountAll({
    where: draftWhere,
    include: [{ model: models.Article, as: 'article', where: articleWhere, required: true }],
    order: [
      ['updatedAt', 'DESC'],
      ['articleId', 'DESC'],
    ],
    limit: pageSize,
    offset: (page - 1) * pageSize,
  });
  const conditionIds = [...new Set(rows.map((r) => r.draftJson.conditionId))];
  const conditions = conditionIds.length ? await models.Condition.findAll({ where: { id: conditionIds }, attributes: ['id', 'name'], paranoid: false }) : [];
  const names = new Map(conditions.map((c) => [lower(c.id), c.name]));
  return { items: rows.map((d) => listItem(d.article, d, names)), page, pageSize, total: count };
}

// ── create and save ────────────────────────────────────────────────────────────────────────────
export async function createArticle({ title, conditionId, accessLevel = ACCESS_LEVEL.MEMBERS, lang = 'en' }, req) {
  await assertConditionExists(conditionId, 'conditionId');
  const draft = normalizeDraft({ title, conditionId, accessLevel, lang, body: EMPTY_DOC });
  const hash = contentHash(draft);
  const article = await sequelize.transaction(async (transaction) => {
    const created = await models.Article.create(
      { conditionId: draft.conditionId, authorId: req.auth.userId, title: draft.title, slug: null, accessLevel, lang, status: ARTICLE_STATUS.DRAFT },
      { transaction },
    );
    await models.ArticleDraft.create({ articleId: created.id, draftVersion: 1, draftJson: draft, draftHash: hash, draftTitle: draft.title, updatedById: req.auth.userId }, { transaction });
    return created;
  });
  await audit('article.created', { req, actorId: req.auth.userId, entityType: 'article', entityId: article.id });
  return getArticle(article.id);
}

/** Audit an autosave at most once per 10 minutes per article and admin (not per keystroke). */
async function auditDraftSave(req, articleId) {
  const key = `audit:draft:${articleId}:${req.auth.userId}`;
  if (await ephemeralStore.get(key)) return;
  await ephemeralStore.set(key, '1', DRAFT_AUDIT_EVERY_SECONDS);
  await audit('article.draft_saved', { req, actorId: req.auth.userId, entityType: 'article', entityId: articleId });
}

/**
 * Run a transaction, retrying a few times if MySQL picks it as a deadlock victim. Saves of different
 * articles can briefly lock the same index ranges while rebuilding usage rows; a retry is the
 * standard, safe answer (the whole transaction was rolled back).
 */
async function withDeadlockRetry(work, attempts = 3) {
  for (let attempt = 1; ; attempt += 1) {
    try {
      return await sequelize.transaction(work);
    } catch (err) {
      const errno = err?.parent?.errno ?? err?.original?.errno;
      if (attempt >= attempts || (errno !== 1213 && errno !== 1205)) throw err;
      await new Promise((r) => setTimeout(r, 20 * attempt + Math.floor(Math.random() * 30)));
    }
  }
}

export async function saveDraft(id, { draftVersion, draft: raw }, req) {
  const draft = normalizeDraft(raw, id);
  await assertConditionExists(draft.conditionId);
  const hash = contentHash(draft);

  const result = await withDeadlockRetry(async (transaction) => {
    const { article, draft: row } = await loadForAdmin(id, { transaction, lock: Transaction.LOCK.UPDATE });
    if (article.deletedAt) throw gone();
    if (row.draftVersion !== draftVersion) throw await staleVersion(row);
    // Same content as stored: nothing to write (autosave fires even when nothing changed).
    // eslint-disable-next-line security/detect-possible-timing-attacks -- content hashes, not secrets
    if (row.draftHash === hash) return { article, row, changed: false };

    const previousLang = row.draftJson.lang;
    await row.update({ draftVersion: row.draftVersion + 1, draftJson: draft, draftHash: hash, draftTitle: draft.title, updatedById: req.auth.userId }, { transaction });
    await rebuildUsage(article.id, [...new Set([previousLang, draft.lang])], CONTENT_SCOPE.DRAFT, draft, transaction);
    const lastSnap = await models.ArticleRevision.findOne({ where: { articleId: article.id, reason: REVISION_REASON.AUTOSNAP }, order: [['id', 'DESC']], attributes: ['createdAt'], transaction });
    if (!lastSnap || Date.now() - lastSnap.createdAt.getTime() >= AUTOSNAP_EVERY_MS) {
      await addRevision(article.id, REVISION_REASON.AUTOSNAP, draft, hash, req.auth.userId, transaction);
    }
    return { article, row, changed: true };
  });
  if (result.changed) await auditDraftSave(req, result.article.id);
  return { draftVersion: result.row.draftVersion, savedAt: result.row.updatedAt, hasUnpublishedChanges: hasUnpublishedChanges(result.article, result.row) };
}

// ── checklist ──────────────────────────────────────────────────────────────────────────────────
/**
 * Everything that must be true to publish (blocking) and things worth knowing (warnings). Inside the
 * publish transaction the rows it relies on are locked FOR SHARE, so nothing changes before commit.
 */
export async function runChecklist(article, draft, { transaction, lock } = {}) {
  const problems = [];
  const block = (field, message) => problems.push({ field, message, blocking: true });
  const warn = (field, message) => problems.push({ field, message, blocking: false });

  if (draft.title.length < 3) block('title', 'The title needs at least 3 characters.');
  if (draft.summary.length < 40) block('summary', `The short description has ${draft.summary.length} characters. Write at least 40 (it’s shown on cards and in search results).`);
  if (draft.summary.length > 300) block('summary', `The short description has ${draft.summary.length} characters. Keep it to 300 to publish.`);

  // A published article keeps its address when the web-address field is empty; only a first publish
  // makes one from the title.
  const slug = draft.slug || article.slug || slugify(draft.title);
  if (!slug) {
    block('slug', 'This title has no English letters to build a web address from. Type one, like "calming-migraine".');
  } else if (!SLUG_PATTERN.test(slug)) {
    block('slug', 'Use only lowercase letters, numbers and single hyphens in the web address.');
  } else {
    const [taken, redirect] = await Promise.all([
      models.Article.findOne({ where: { slug, id: { [Op.ne]: article.id } }, attributes: ['id'], transaction }),
      models.ArticleSlugRedirect.findByPk(slug, { attributes: ['articleId'], transaction }),
    ]);
    if (taken) block('slug', `The web address "${slug}" is already used by another article. Choose another.`);
    else if (redirect && lower(redirect.articleId) !== lower(article.id)) block('slug', `The web address "${slug}" used to belong to another article (old links still lead there). Choose another.`);
    const [{ n } = { n: 0 }] = await sequelize.query(
      `SELECT COUNT(*) AS n FROM article_drafts d JOIN articles a ON a.id = d.article_id
        WHERE d.article_id <> :id AND a.deleted_at IS NULL AND JSON_UNQUOTE(JSON_EXTRACT(d.draft_json, '$.slug')) = :slug`,
      { replacements: { id: article.id, slug }, type: QueryTypes.SELECT, transaction },
    );
    if (Number(n) > 0) warn('slug', `Another draft also wants the web address "${slug}". Whichever is published first gets it.`);
  }

  const condition = await models.Condition.findByPk(draft.conditionId, { attributes: ['id', 'name', 'isPublished'], transaction, lock });
  if (!condition) block('conditionId', 'The condition no longer exists. Choose another one.');
  else if (!condition.isPublished) block('conditionId', `The condition “${condition.name}” is hidden. Publish it first (Admin → Conditions).`);

  const refs = collectReferences(draft.body);
  const images = await readyImages([draft.cover.mediaId, ...refs.images.map((i) => i.mediaId)], { transaction, lock });
  if (!draft.cover.mediaId) block('cover', 'Choose a thumbnail image.');
  else if (!images.has(draft.cover.mediaId)) block('cover', 'The thumbnail image no longer exists or isn’t ready. Choose another.');
  else if (!draft.cover.alt && !images.get(draft.cover.mediaId).altText) block('cover.alt', 'Describe the thumbnail image (alt text) for people who can’t see it.');

  const words = countWords(extractText(draft.body));
  if (words < MIN_WORDS) block('body', `The article has ${words} word${words === 1 ? '' : 's'}. Write at least ${MIN_WORDS}.`);

  refs.images.forEach((image, i) => {
    const media = images.get(image.mediaId);
    if (!media) block(`body.image[${i}]`, `Image ${i + 1} no longer exists or isn’t ready. Remove it or choose another.`);
    else if (!image.alt && !media.altText) block(`body.image[${i}]`, `Describe image ${i + 1} (alt text) for people who can’t see it.`);
  });

  const targets = [...new Set([...refs.links, ...refs.cards, ...draft.relatedIds])];
  if (targets.length) {
    const live = await models.Article.findAll({ where: { id: targets, status: ARTICLE_STATUS.PUBLISHED }, attributes: ['id'], transaction });
    const liveIds = new Set(live.map((a) => lower(a.id)));
    const hidden = targets.filter((t) => !liveIds.has(t) && t !== lower(article.id));
    if (hidden.length) {
      warn('references', `${hidden.length} linked or related article${hidden.length === 1 ? ' isn’t' : 's aren’t'} published. Readers will see plain text instead of ${hidden.length === 1 ? 'that link' : 'those links'}, and no card.`);
    }
  }
  return { ready: !problems.some((p) => p.blocking), slug, words, problems };
}

export async function getChecklist(id) {
  const { article, draft } = await loadForAdmin(id);
  if (article.deletedAt) throw notFound();
  const { ready, problems } = await runChecklist(article, draft.draftJson);
  return { ready, problems };
}

export async function preview(id) {
  const { article, draft } = await loadForAdmin(id);
  if (article.deletedAt) throw notFound();
  const d = draft.draftJson;
  const words = countWords(extractText(d.body));
  return { preview: await buildReaderPayload({ ...d, slug: d.slug || slugify(d.title), readingMinutes: readingMinutes(words), publishedAt: article.publishedAt, contentUpdatedAt: article.contentUpdatedAt }) };
}

// ── publish and status changes ─────────────────────────────────────────────────────────────────
const afterChange = () => cache.bumpGeneration(ARTICLES_CACHE);

export async function publish(id, { draftVersion }, req) {
  const outcome = await withDeadlockRetry(async (transaction) => {
    const { article, draft: row } = await loadForAdmin(id, { transaction, lock: Transaction.LOCK.UPDATE });
    if (article.deletedAt) throw gone();
    if (row.draftVersion !== draftVersion) throw await staleVersion(row);
    const draft = row.draftJson;
    const checklist = await runChecklist(article, draft, { transaction, lock: Transaction.LOCK.SHARE });
    if (!checklist.ready) {
      throw new ApiError(422, 'This article isn’t ready to publish yet.', checklist.problems.filter((p) => p.blocking), 'PUBLISH_CHECKLIST');
    }

    const previousSlug = article.slug;
    const previousLang = article.lang;
    const now = new Date();
    const text = extractText(draft.body);
    await article.update(
      {
        title: draft.title,
        slug: checklist.slug,
        summary: draft.summary,
        conditionId: draft.conditionId,
        accessLevel: draft.accessLevel,
        lang: draft.lang,
        cardAccent: draft.accent,
        coverImageId: draft.cover.mediaId,
        coverAlt: draft.cover.alt || null,
        coverFocalX: draft.cover.focalX,
        coverFocalY: draft.cover.focalY,
        relatedIds: draft.relatedIds,
        seoTitle: draft.seoTitle || null,
        seoDescription: draft.seoDescription || null,
        contentJson: draft.body,
        contentText: text,
        readingMinutes: readingMinutes(checklist.words),
        liveHash: row.draftHash,
        liveVersion: article.liveVersion + 1,
        status: ARTICLE_STATUS.PUBLISHED,
        publishedAt: article.publishedAt ?? now,
        contentUpdatedAt: now,
      },
      { transaction },
    );
    // Old address keeps working; taking back one of its own old addresses removes that redirect.
    await models.ArticleSlugRedirect.destroy({ where: { slug: checklist.slug, articleId: article.id }, transaction });
    if (previousSlug && previousSlug !== checklist.slug) {
      await models.ArticleSlugRedirect.findOrCreate({ where: { slug: previousSlug }, defaults: { articleId: article.id }, transaction });
    }
    await rebuildUsage(article.id, [...new Set([previousLang, draft.lang])], CONTENT_SCOPE.LIVE, draft, transaction);
    await addRevision(article.id, REVISION_REASON.PUBLISH, draft, row.draftHash, req.auth.userId, transaction);
    return { article, warnings: checklist.problems.filter((p) => !p.blocking) };
  }).catch((err) => {
    // Two articles published with the same address at the same moment: the unique index decides.
    if (err instanceof UniqueConstraintError) {
      const message = 'Another article was just published with this web address. Choose another.';
      throw new ApiError(409, message, [{ field: 'slug', message, blocking: true }], 'SLUG_TAKEN');
    }
    throw err;
  });
  await afterChange();
  await audit('article.published', { req, actorId: req.auth.userId, entityType: 'article', entityId: outcome.article.id, metadata: { liveVersion: outcome.article.liveVersion, slug: outcome.article.slug } });
  return { ...(await getArticle(outcome.article.id)), warnings: outcome.warnings };
}

async function assertNoInboundUnlessConfirmed(articleId, confirm, transaction, action) {
  const count = await inboundPublishedCount(articleId, transaction);
  if (count > 0 && !confirm) {
    throw new ApiError(
      409,
      `${count} published article${count === 1 ? ' links' : 's link'} here. If you ${action}, ${count === 1 ? 'that link becomes' : 'those links become'} plain text and ${count === 1 ? 'its card disappears' : 'their cards disappear'}. Send confirm: true to go ahead.`,
      { count },
      'HAS_INBOUND_LINKS',
    );
  }
}

async function changeStatus(id, { confirm }, req, { from, to, action, auditAction }) {
  const article = await sequelize.transaction(async (transaction) => {
    const { article: row } = await loadForAdmin(id, { transaction, lock: Transaction.LOCK.UPDATE });
    if (row.deletedAt) throw notFound();
    if (!from.includes(row.status)) {
      throw ApiError.conflict(`This article is ${row.status}, so it can’t be ${action === 'unpublish' ? 'unpublished' : 'archived'}.`, 'WRONG_STATUS');
    }
    await assertNoInboundUnlessConfirmed(row.id, confirm, transaction, action);
    await row.update({ status: to }, { transaction });
    return row;
  });
  await afterChange();
  await audit(auditAction, { req, actorId: req.auth.userId, entityType: 'article', entityId: article.id });
  return getArticle(article.id);
}

export const unpublish = (id, body, req) =>
  changeStatus(id, body, req, { from: [ARTICLE_STATUS.PUBLISHED, ARTICLE_STATUS.ARCHIVED], to: ARTICLE_STATUS.DRAFT, action: 'unpublish', auditAction: 'article.unpublished' });

export const archive = (id, body, req) =>
  changeStatus(id, body, req, { from: [ARTICLE_STATUS.PUBLISHED], to: ARTICLE_STATUS.ARCHIVED, action: 'archive', auditAction: 'article.archived' });

/** Throw away unpublished changes: the draft becomes the last published copy again. */
export async function discardDraft(id, { draftVersion }, req) {
  await sequelize.transaction(async (transaction) => {
    const { article, draft: row } = await loadForAdmin(id, { transaction, lock: Transaction.LOCK.UPDATE });
    if (article.deletedAt) throw gone();
    if (row.draftVersion !== draftVersion) throw await staleVersion(row);
    const lastPublish = article.liveHash
      ? await models.ArticleRevision.findOne({ where: { articleId: article.id, reason: REVISION_REASON.PUBLISH }, order: [['id', 'DESC']], transaction })
      : null;
    if (!lastPublish) throw ApiError.conflict('This article has never been published, so there is no published copy to go back to.', 'NEVER_PUBLISHED');
    const previousLang = row.draftJson.lang;
    await addRevision(article.id, REVISION_REASON.RESTORE, row.draftJson, row.draftHash, req.auth.userId, transaction);
    await row.update(
      { draftVersion: row.draftVersion + 1, draftJson: lastPublish.snapshot, draftHash: lastPublish.snapshotHash, draftTitle: lastPublish.snapshot.title, updatedById: req.auth.userId },
      { transaction },
    );
    await rebuildUsage(article.id, [...new Set([previousLang, lastPublish.snapshot.lang])], CONTENT_SCOPE.DRAFT, lastPublish.snapshot, transaction);
  });
  await audit('article.draft_discarded', { req, actorId: req.auth.userId, entityType: 'article', entityId: id });
  return getArticle(id);
}

export async function removeArticle(id, { draftVersion, confirm }, req) {
  await sequelize.transaction(async (transaction) => {
    const { article, draft: row } = await loadForAdmin(id, { transaction, lock: Transaction.LOCK.UPDATE });
    if (article.deletedAt) throw notFound();
    if (row.draftVersion !== draftVersion) throw await staleVersion(row);
    await assertNoInboundUnlessConfirmed(article.id, confirm, transaction, 'delete it');
    await addRevision(article.id, REVISION_REASON.DELETE, row.draftJson, row.draftHash, req.auth.userId, transaction);
    // Its links and media uses go, so media can be deleted and other articles' counts are right.
    await models.ArticleReference.destroy({ where: { sourceArticleId: article.id }, transaction });
    await models.ArticleMedia.destroy({ where: { articleId: article.id }, transaction });
    await models.ArticleSlugRedirect.destroy({ where: { articleId: article.id }, transaction });
    await article.destroy({ transaction });
  });
  await afterChange();
  await audit('article.deleted', { req, actorId: req.auth.userId, entityType: 'article', entityId: id });
}

// ── revisions ──────────────────────────────────────────────────────────────────────────────────
export async function listRevisions(id) {
  const { article } = await loadForAdmin(id);
  if (article.deletedAt) throw notFound();
  const rows = await models.ArticleRevision.findAll({
    where: { articleId: article.id },
    attributes: ['id', 'reason', 'sizeBytes', 'createdAt', 'createdById'], // never the snapshots themselves
    include: [{ model: models.User, as: 'createdBy', attributes: ['displayName'] }],
    order: [['id', 'DESC']],
    limit: 200,
  });
  return { items: rows.map((r) => ({ id: String(r.id), reason: r.reason, sizeBytes: r.sizeBytes, createdAt: r.createdAt, createdBy: r.createdBy?.displayName ?? null })) };
}

async function findRevision(articleId, revisionId, transaction) {
  const revision = await models.ArticleRevision.findOne({ where: { id: revisionId, articleId }, transaction });
  if (!revision) throw ApiError.notFound('This revision doesn’t exist.');
  return revision;
}

export async function getRevision(id, revisionId) {
  const { article } = await loadForAdmin(id);
  if (article.deletedAt) throw notFound();
  const r = await findRevision(article.id, revisionId);
  return { revision: { id: String(r.id), reason: r.reason, createdAt: r.createdAt, snapshot: r.snapshot } };
}

export async function saveManualRevision(id, req) {
  await sequelize.transaction(async (transaction) => {
    const { article, draft: row } = await loadForAdmin(id, { transaction, lock: Transaction.LOCK.UPDATE });
    if (article.deletedAt) throw gone();
    await addRevision(article.id, REVISION_REASON.MANUAL, row.draftJson, row.draftHash, req.auth.userId, transaction);
  });
  await audit('article.revision_saved', { req, actorId: req.auth.userId, entityType: 'article', entityId: id });
  return listRevisions(id);
}

export async function restoreRevision(id, revisionId, { draftVersion }, req) {
  await sequelize.transaction(async (transaction) => {
    const { article, draft: row } = await loadForAdmin(id, { transaction, lock: Transaction.LOCK.UPDATE });
    if (article.deletedAt) throw gone();
    if (row.draftVersion !== draftVersion) throw await staleVersion(row);
    const revision = await findRevision(article.id, revisionId, transaction);
    let snapshot;
    try {
      snapshot = normalizeDraft(revision.snapshot, article.id); // rules may have tightened since it was saved
    } catch {
      throw ApiError.conflict('This revision can’t be restored as it is: it no longer meets the current rules.', 'REVISION_INCOMPATIBLE');
    }
    const hash = contentHash(snapshot);
    await addRevision(article.id, REVISION_REASON.RESTORE, row.draftJson, row.draftHash, req.auth.userId, transaction);
    const previousLang = row.draftJson.lang;
    await row.update({ draftVersion: row.draftVersion + 1, draftJson: snapshot, draftHash: hash, draftTitle: snapshot.title, updatedById: req.auth.userId }, { transaction });
    await rebuildUsage(article.id, [...new Set([previousLang, snapshot.lang])], CONTENT_SCOPE.DRAFT, snapshot, transaction);
  });
  await audit('article.revision_restored', { req, actorId: req.auth.userId, entityType: 'article', entityId: id, metadata: { revisionId: String(revisionId) } });
  return getArticle(id);
}

// Exported for the media and conditions services (and tests).
export { inboundPublishedCount };
