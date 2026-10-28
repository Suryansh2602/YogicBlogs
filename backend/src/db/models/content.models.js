// Content tables: conditions, articles, media, and per-user reading data for the user dashboard.
import { DataTypes, Model } from 'sequelize';
import { v7 as uuidv7 } from 'uuid';
import { ACCESS_LEVEL, ARTICLE_STATUS, MEDIA_KIND, MEDIA_VISIBILITY, SLUG_PATTERN } from '../../config/constants.js';

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
      // Resized image renditions, e.g. { "480": "images/x-480.webp", "960": ... }.
      variants: { type: DataTypes.JSON, allowNull: true },
      originalName: { type: DataTypes.STRING(255), allowNull: true },
      mimeType: { type: DataTypes.STRING(100), allowNull: false },
      sizeBytes: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
      checksumSha256: { type: DataTypes.CHAR(64), allowNull: false, validate: { is: /^[a-f0-9]{64}$/ } },
      width: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true },
      height: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true },
      durationSeconds: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true },
      altText: { type: DataTypes.STRING(255), allowNull: true },
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
      title: { type: DataTypes.STRING(200), allowNull: false, validate: { len: [3, 200] } },
      slug: slug(220),
      summary: { type: DataTypes.STRING(500), allowNull: true },
      // Editor document (source of truth for editing) and its server-sanitised HTML (for rendering).
      contentJson: { type: DataTypes.JSON, allowNull: true },
      contentHtml: { type: DataTypes.TEXT('medium'), allowNull: true },
      coverImageId: { type: DataTypes.UUID, allowNull: true },
      audioId: { type: DataTypes.UUID, allowNull: true },
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
      indexes: [{ fields: ['status', 'published_at'] }, { fields: ['condition_id', 'status'] }, { fields: ['author_id'] }],
      validate: {
        publishedNeedsDate() {
          if (this.status === ARTICLE_STATUS.PUBLISHED && !this.publishedAt) {
            throw new Error('publishedAt is required when status is published');
          }
        },
      },
    },
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

  return { Condition, Media, Article, ArticleBookmark, ReadingProgress };
}
