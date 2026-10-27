// Content tables: conditions, articles (live copy, drafts, references, media usage, revisions, old slugs),
// media, and per-user reading data for the user dashboard.
import { DataTypes, Model } from 'sequelize';
import { v7 as uuidv7 } from 'uuid';
import {
  ACCESS_LEVEL,
  ARTICLE_LANGS,
  ARTICLE_MEDIA_ROLE,
  ARTICLE_STATUS,
  CARD_ACCENTS,
  CONTENT_SCOPE,
  MEDIA_KIND,
  MEDIA_STATUS,
  MEDIA_VISIBILITY,
  REFERENCE_KIND,
  REVISION_REASON,
  SLUG_PATTERN,
  STORAGE_BACKEND,
} from '../../config/constants.js';

const uuidPk = () => ({ type: DataTypes.UUID, primaryKey: true, defaultValue: () => uuidv7() });
// Uniqueness is enforced in MySQL among non-deleted rows only (generated `alive` column),
// so a slug frees up again after a soft delete. See docs/database.md.
const slug = (max) => ({
  type: DataTypes.STRING(max),
  allowNull: false,
  validate: { is: SLUG_PATTERN, len: [1, max] },
});
const seo = () => ({
  seoTitle: { type: DataTypes.STRING(70), allowNull: true },
  seoDescription: { type: DataTypes.STRING(160), allowNull: true },
});

export class Condition extends Model {}
export class Media extends Model {}
export class Article extends Model {
  get isPublished() {
    return this.status === ARTICLE_STATUS.PUBLISHED && this.publishedAt !== null && this.publishedAt <= new Date();
  }
}
export class ArticleDraft extends Model {}
export class ArticleReference extends Model {}
export class ArticleMedia extends Model {}
export class ArticleRevision extends Model {}
export class ArticleSlugRedirect extends Model {}
export class ArticleBookmark extends Model {}
export class ReadingProgress extends Model {}

export function initContentModels(sequelize) {
  Condition.init(
    {
      id: uuidPk(),
      name: { type: DataTypes.STRING(120), allowNull: false, validate: { len: [1, 120] } },
      slug: slug(140),
      summary: { type: DataTypes.STRING(500), allowNull: true },
      description: { type: DataTypes.TEXT, allowNull: true },
      heroImageId: { type: DataTypes.UUID, allowNull: true },
      ...seo(),
      sortOrder: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      isPublished: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    },
    { sequelize, modelName: 'Condition', tableName: 'conditions', paranoid: true },
  );

  Media.init(
    {
      id: uuidPk(),
      uploadedById: { type: DataTypes.UUID, allowNull: true },
      kind: { type: DataTypes.STRING(16), allowNull: false, validate: { isIn: [Object.values(MEDIA_KIND)] } },
      visibility: {
        type: DataTypes.STRING(16),
        allowNull: false,
        defaultValue: MEDIA_VISIBILITY.PROTECTED,
        validate: { isIn: [Object.values(MEDIA_VISIBILITY)] },
      },
      // Server-generated path/key in storage (never the client's file name).
      storageKey: { type: DataTypes.STRING(512), allowNull: false, unique: true },
      // Image renditions by width: { "480": { key: "images/2026/10/<id>-480.webp", height, bytes }, ... }.
      variants: { type: DataTypes.JSON, allowNull: true },
      originalName: { type: DataTypes.STRING(255), allowNull: true },
      mimeType: { type: DataTypes.STRING(100), allowNull: false },
      sizeBytes: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
      checksumSha256: { type: DataTypes.CHAR(64), allowNull: false, validate: { is: /^[a-f0-9]{64}$/ } },
      width: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true },
      height: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true },
      durationSeconds: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true },
      altText: { type: DataTypes.STRING(255), allowNull: true },
      status: {
        type: DataTypes.STRING(12),
        allowNull: false,
        defaultValue: MEDIA_STATUS.READY,
        validate: { isIn: [Object.values(MEDIA_STATUS)] },
      },
      failureReason: { type: DataTypes.STRING(64), allowNull: true },
      // Tiny blurred preview shown while the real image loads (data:image/webp;base64,…).
      placeholder: { type: DataTypes.STRING(700), allowNull: true },
      storageBackend: {
        type: DataTypes.STRING(8),
        allowNull: false,
        defaultValue: STORAGE_BACKEND.LOCAL,
        validate: { isIn: [Object.values(STORAGE_BACKEND)] },
      },
    },
    {
      sequelize,
      modelName: 'Media',
      tableName: 'media',
      paranoid: true,
      indexes: [{ fields: ['kind'] }, { fields: ['uploaded_by_id'] }],
    },
  );

  Article.init(
    {
      id: uuidPk(),
      conditionId: { type: DataTypes.UUID, allowNull: false },
      authorId: { type: DataTypes.UUID, allowNull: true },
      // Everything below is the LIVE copy: written only when publishing (the draft is in article_drafts).
      title: { type: DataTypes.STRING(200), allowNull: false, validate: { len: [3, 200] } },
      // Set when first published; old addresses go to article_slug_redirects.
      slug: { ...slug(220), allowNull: true },
      summary: { type: DataTypes.STRING(500), allowNull: true },
      // The live body (allow-listed editor JSON, no HTML anywhere) and its plain text (search, reading time).
      contentJson: { type: DataTypes.JSON, allowNull: true },
      contentText: { type: DataTypes.TEXT('medium'), allowNull: true },
      lang: { type: DataTypes.STRING(8), allowNull: false, defaultValue: 'en', validate: { isIn: [ARTICLE_LANGS] } },
      cardAccent: { type: DataTypes.STRING(12), allowNull: false, defaultValue: 'saffron', validate: { isIn: [CARD_ACCENTS] } },
      coverImageId: { type: DataTypes.UUID, allowNull: true },
      coverAlt: { type: DataTypes.STRING(255), allowNull: true },
      coverFocalX: { type: DataTypes.TINYINT.UNSIGNED, allowNull: false, defaultValue: 50, validate: { max: 100 } },
      coverFocalY: { type: DataTypes.TINYINT.UNSIGNED, allowNull: false, defaultValue: 50, validate: { max: 100 } },
      relatedIds: { type: DataTypes.JSON, allowNull: true },
      audioId: { type: DataTypes.UUID, allowNull: true },
      liveHash: { type: DataTypes.CHAR(64), allowNull: true },
      // Bumped on every publish: part of the cache key, and what translations will record as their source.
      liveVersion: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, defaultValue: 0 },
      // First publish is publishedAt; every later publish sets this ("Updated on").
      contentUpdatedAt: { type: DataTypes.DATE, allowNull: true },
      status: {
        type: DataTypes.STRING(16),
        allowNull: false,
        defaultValue: ARTICLE_STATUS.DRAFT,
        validate: { isIn: [Object.values(ARTICLE_STATUS)] },
      },
      publishedAt: { type: DataTypes.DATE, allowNull: true },
      readingMinutes: { type: DataTypes.SMALLINT.UNSIGNED, allowNull: true },
      accessLevel: {
        type: DataTypes.STRING(16),
        allowNull: false,
        defaultValue: ACCESS_LEVEL.MEMBERS,
        validate: { isIn: [Object.values(ACCESS_LEVEL)] },
      },
      ...seo(),
    },
    {
      sequelize,
      modelName: 'Article',
      tableName: 'articles',
      paranoid: true,
      // Optimistic locking: saving a stale copy (another admin saved in between) throws OptimisticLockError.
      version: true,
      indexes: [{ fields: ['status', 'published_at', 'id'] }, { fields: ['condition_id', 'status'] }, { fields: ['author_id'] }],
      validate: {
        publishedNeedsDate() {
          if (this.status === ARTICLE_STATUS.PUBLISHED && !this.publishedAt) {
            throw new Error('publishedAt is required when status is published');
          }
        },
        liveNeedsSlug() {
          if (this.status !== ARTICLE_STATUS.DRAFT && !this.slug) throw new Error('slug is required once an article has been published');
        },
      },
    },
  );

  ArticleDraft.init(
    {
      articleId: { type: DataTypes.UUID, primaryKey: true },
      // Its own optimistic lock: only draft saves, publish, discard and restore bump it.
      draftVersion: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, defaultValue: 1 },
      draftJson: { type: DataTypes.JSON, allowNull: false },
      draftHash: { type: DataTypes.CHAR(64), allowNull: false },
      // Copied out of draftJson so the admin list can search and sort it with an index.
      draftTitle: { type: DataTypes.STRING(200), allowNull: false },
      updatedById: { type: DataTypes.UUID, allowNull: true },
    },
    { sequelize, modelName: 'ArticleDraft', tableName: 'article_drafts' },
  );

  const scoped = {
    lang: { type: DataTypes.STRING(8), primaryKey: true, validate: { isIn: [ARTICLE_LANGS] } },
    scope: { type: DataTypes.STRING(8), primaryKey: true, validate: { isIn: [Object.values(CONTENT_SCOPE)] } },
  };

  ArticleReference.init(
    {
      sourceArticleId: { type: DataTypes.UUID, primaryKey: true },
      ...scoped,
      kind: { type: DataTypes.STRING(8), primaryKey: true, validate: { isIn: [Object.values(REFERENCE_KIND)] } },
      // No foreign key: articles are only soft-deleted, and targets are resolved when a page is read.
      targetArticleId: { type: DataTypes.UUID, primaryKey: true },
    },
    { sequelize, modelName: 'ArticleReference', tableName: 'article_references', timestamps: false },
  );

  ArticleMedia.init(
    {
      articleId: { type: DataTypes.UUID, primaryKey: true },
      ...scoped,
      role: { type: DataTypes.STRING(10), primaryKey: true, validate: { isIn: [Object.values(ARTICLE_MEDIA_ROLE)] } },
      mediaId: { type: DataTypes.UUID, primaryKey: true },
    },
    { sequelize, modelName: 'ArticleMedia', tableName: 'article_media', timestamps: false },
  );

  ArticleRevision.init(
    {
      id: { type: DataTypes.BIGINT.UNSIGNED, autoIncrement: true, primaryKey: true },
      articleId: { type: DataTypes.UUID, allowNull: false },
      reason: { type: DataTypes.STRING(10), allowNull: false, validate: { isIn: [Object.values(REVISION_REASON)] } },
      snapshot: { type: DataTypes.JSON, allowNull: false },
      snapshotHash: { type: DataTypes.CHAR(64), allowNull: false },
      sizeBytes: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
      createdById: { type: DataTypes.UUID, allowNull: true },
    },
    { sequelize, modelName: 'ArticleRevision', tableName: 'article_revisions', updatedAt: false },
  );

  ArticleSlugRedirect.init(
    {
      slug: { type: DataTypes.STRING(220), primaryKey: true, validate: { is: SLUG_PATTERN } },
      articleId: { type: DataTypes.UUID, allowNull: false },
    },
    { sequelize, modelName: 'ArticleSlugRedirect', tableName: 'article_slug_redirects', updatedAt: false },
  );

  ArticleBookmark.init(
    {
      userId: { type: DataTypes.UUID, primaryKey: true },
      articleId: { type: DataTypes.UUID, primaryKey: true },
    },
    { sequelize, modelName: 'ArticleBookmark', tableName: 'article_bookmarks', updatedAt: false },
  );

  ReadingProgress.init(
    {
      userId: { type: DataTypes.UUID, primaryKey: true },
      articleId: { type: DataTypes.UUID, primaryKey: true },
      progressPercent: {
        type: DataTypes.TINYINT.UNSIGNED,
        allowNull: false,
        defaultValue: 0,
        validate: { min: 0, max: 100 },
      },
      audioPositionSeconds: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, defaultValue: 0 },
      completedAt: { type: DataTypes.DATE, allowNull: true },
      lastViewedAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    },
    {
      sequelize,
      modelName: 'ReadingProgress',
      tableName: 'reading_progress',
      indexes: [{ fields: ['user_id', 'last_viewed_at'] }],
    },
  );

  return { Condition, Media, Article, ArticleDraft, ArticleReference, ArticleMedia, ArticleRevision, ArticleSlugRedirect, ArticleBookmark, ReadingProgress };
}
