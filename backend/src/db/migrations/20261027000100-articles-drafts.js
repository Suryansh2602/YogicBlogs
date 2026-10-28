// Articles get a separate draft (article_drafts), live-only search text, card design fields, references,
// media usage, revisions and old-slug redirects. See docs/articles.md §6.
import { addCheckIn, fk, TABLE_OPTIONS } from '../migrationHelpers.js';

const STRICT = { onDelete: 'RESTRICT', onUpdate: 'RESTRICT' };
const LANGS = ['en', 'hi'];

export async function up({ queryInterface, Sequelize }) {
  const q = (sql) => queryInterface.sequelize.query(sql);

  // ── articles: live copy ────────────────────────────────────────────────────────────────────
  await queryInterface.changeColumn('articles', 'slug', { type: Sequelize.STRING(220), allowNull: true });
  await queryInterface.removeColumn('articles', 'content_html'); // no HTML is ever stored
  await queryInterface.addColumn('articles', 'lang', { type: Sequelize.STRING(8), allowNull: false, defaultValue: 'en' });
  await queryInterface.addColumn('articles', 'card_accent', { type: Sequelize.STRING(12), allowNull: false, defaultValue: 'saffron' });
  await queryInterface.addColumn('articles', 'cover_alt', { type: Sequelize.STRING(255), allowNull: true });
  await queryInterface.addColumn('articles', 'cover_focal_x', { type: Sequelize.TINYINT.UNSIGNED, allowNull: false, defaultValue: 50 });
  await queryInterface.addColumn('articles', 'cover_focal_y', { type: Sequelize.TINYINT.UNSIGNED, allowNull: false, defaultValue: 50 });
  await queryInterface.addColumn('articles', 'related_ids', { type: Sequelize.JSON, allowNull: true });
  await queryInterface.addColumn('articles', 'content_text', { type: Sequelize.TEXT('medium'), allowNull: true });
  await queryInterface.addColumn('articles', 'live_hash', { type: Sequelize.CHAR(64), allowNull: true });
  await queryInterface.addColumn('articles', 'live_version', { type: Sequelize.INTEGER.UNSIGNED, allowNull: false, defaultValue: 0 });
  await queryInterface.addColumn('articles', 'content_updated_at', { type: Sequelize.DATE, allowNull: true });
  await addCheckIn(queryInterface, 'articles', 'lang', LANGS);
  await addCheckIn(queryInterface, 'articles', 'card_accent', ['saffron', 'teal', 'lotus', 'gold']);
  await q('ALTER TABLE `articles` ADD CONSTRAINT `articles_cover_focal_chk` CHECK (`cover_focal_x` <= 100 AND `cover_focal_y` <= 100)');
  await q("ALTER TABLE `articles` ADD CONSTRAINT `articles_slug_when_live_chk` CHECK (`status` = 'draft' OR `slug` IS NOT NULL)");
  // Search covers the live text too; the public list pages by (published_at, id).
  await queryInterface.removeIndex('articles', 'articles_search');
  await queryInterface.addIndex('articles', ['title', 'summary', 'content_text'], { type: 'FULLTEXT', name: 'articles_search' });
  await queryInterface.removeIndex('articles', 'articles_status_published');
  await queryInterface.addIndex('articles', ['status', 'published_at', 'id'], { name: 'articles_status_published' });

  // ── drafts: what admins edit (never public) ────────────────────────────────────────────────
  await queryInterface.createTable(
    'article_drafts',
    {
      article_id: fk(Sequelize, 'articles', { primaryKey: true, ...STRICT }),
      draft_version: { type: Sequelize.INTEGER.UNSIGNED, allowNull: false, defaultValue: 1 },
      draft_json: { type: Sequelize.JSON, allowNull: false },
      draft_hash: { type: Sequelize.CHAR(64), allowNull: false },
      draft_title: { type: Sequelize.STRING(200), allowNull: false },
      updated_by_id: fk(Sequelize, 'users', { allowNull: true, onDelete: 'SET NULL', onUpdate: 'RESTRICT' }),
      created_at: { type: Sequelize.DATE, allowNull: false },
      updated_at: { type: Sequelize.DATE, allowNull: false },
    },
    TABLE_OPTIONS,
  );
  await queryInterface.addIndex('article_drafts', ['draft_title'], { name: 'article_drafts_title' });

  // Existing articles (if any) get a draft equal to their live copy.
  await q(`INSERT INTO article_drafts (article_id, draft_version, draft_json, draft_hash, draft_title, created_at, updated_at)
    SELECT id, 1,
      JSON_OBJECT('title', title, 'slug', slug, 'summary', COALESCE(summary, ''), 'conditionId', condition_id,
        'accessLevel', access_level, 'lang', 'en', 'accent', 'saffron',
        'cover', JSON_OBJECT('mediaId', cover_image_id, 'alt', '', 'focalX', 50, 'focalY', 50),
        'relatedIds', JSON_ARRAY(), 'seoTitle', COALESCE(seo_title, ''), 'seoDescription', COALESCE(seo_description, ''),
        'body', COALESCE(content_json, JSON_OBJECT('type', 'doc', 'content', JSON_ARRAY()))),
      REPEAT('0', 64), title, NOW(), NOW()
    FROM articles`);

  // ── references between articles (no FK on the target: resolved when read) ──────────────────
  await queryInterface.createTable(
    'article_references',
    {
      source_article_id: fk(Sequelize, 'articles', { primaryKey: true, ...STRICT }),
      lang: { type: Sequelize.STRING(8), allowNull: false, primaryKey: true },
      scope: { type: Sequelize.STRING(8), allowNull: false, primaryKey: true },
      kind: { type: Sequelize.STRING(8), allowNull: false, primaryKey: true },
      target_article_id: { type: Sequelize.UUID, allowNull: false, primaryKey: true },
    },
    TABLE_OPTIONS,
  );
  await addCheckIn(queryInterface, 'article_references', 'lang', LANGS);
  await addCheckIn(queryInterface, 'article_references', 'scope', ['draft', 'live']);
  await addCheckIn(queryInterface, 'article_references', 'kind', ['link', 'card', 'related']);
  await queryInterface.addIndex('article_references', ['target_article_id', 'scope'], { name: 'article_references_target' });

  // ── media used by articles (cover, inline images; narration later) ─────────────────────────
  await queryInterface.createTable(
    'article_media',
    {
      article_id: fk(Sequelize, 'articles', { primaryKey: true, ...STRICT }),
      lang: { type: Sequelize.STRING(8), allowNull: false, primaryKey: true },
      scope: { type: Sequelize.STRING(8), allowNull: false, primaryKey: true },
      role: { type: Sequelize.STRING(10), allowNull: false, primaryKey: true },
      media_id: fk(Sequelize, 'media', { primaryKey: true, ...STRICT }),
    },
    TABLE_OPTIONS,
  );
  await addCheckIn(queryInterface, 'article_media', 'lang', LANGS);
  await addCheckIn(queryInterface, 'article_media', 'scope', ['draft', 'live']);
  await addCheckIn(queryInterface, 'article_media', 'role', ['cover', 'inline', 'narration']);
  await queryInterface.addIndex('article_media', ['media_id'], { name: 'article_media_media' });

  // ── revisions ──────────────────────────────────────────────────────────────────────────────
  await queryInterface.createTable(
    'article_revisions',
    {
      id: { type: Sequelize.BIGINT.UNSIGNED, autoIncrement: true, primaryKey: true },
      article_id: fk(Sequelize, 'articles', STRICT),
      reason: { type: Sequelize.STRING(10), allowNull: false },
      snapshot: { type: Sequelize.JSON, allowNull: false },
      snapshot_hash: { type: Sequelize.CHAR(64), allowNull: false },
      size_bytes: { type: Sequelize.INTEGER.UNSIGNED, allowNull: false },
      created_by_id: fk(Sequelize, 'users', { allowNull: true, onDelete: 'SET NULL', onUpdate: 'RESTRICT' }),
      created_at: { type: Sequelize.DATE, allowNull: false },
    },
    TABLE_OPTIONS,
  );
  await addCheckIn(queryInterface, 'article_revisions', 'reason', ['publish', 'manual', 'autosnap', 'restore', 'delete']);
  await queryInterface.addIndex('article_revisions', ['article_id', 'reason', 'created_at'], { name: 'article_revisions_article' });

  // ── old addresses keep working ─────────────────────────────────────────────────────────────
  await queryInterface.createTable(
    'article_slug_redirects',
    {
      slug: { type: Sequelize.STRING(220), allowNull: false, primaryKey: true },
      article_id: fk(Sequelize, 'articles', STRICT),
      created_at: { type: Sequelize.DATE, allowNull: false },
    },
    TABLE_OPTIONS,
  );
}

export async function down({ queryInterface, Sequelize }) {
  const q = (sql) => queryInterface.sequelize.query(sql);
  for (const table of ['article_slug_redirects', 'article_revisions', 'article_media', 'article_references', 'article_drafts']) {
    await queryInterface.dropTable(table);
  }
  await queryInterface.removeIndex('articles', 'articles_status_published');
  await queryInterface.addIndex('articles', ['status', 'published_at'], { name: 'articles_status_published' });
  await queryInterface.removeIndex('articles', 'articles_search');
  await queryInterface.addIndex('articles', ['title', 'summary'], { type: 'FULLTEXT', name: 'articles_search' });
  for (const name of ['articles_slug_when_live_chk', 'articles_cover_focal_chk', 'articles_card_accent_chk', 'articles_lang_chk']) {
    await q(`ALTER TABLE \`articles\` DROP CHECK \`${name}\``);
  }
  for (const column of ['content_updated_at', 'live_version', 'live_hash', 'content_text', 'related_ids', 'cover_focal_y', 'cover_focal_x', 'cover_alt', 'card_accent', 'lang']) {
    await queryInterface.removeColumn('articles', column);
  }
  await queryInterface.addColumn('articles', 'content_html', { type: Sequelize.TEXT('medium'), allowNull: true });
  // Rows without a slug (never published) get one made from their id, so the column can be required again.
  await q("UPDATE `articles` SET `slug` = CONCAT('article-', REPLACE(`id`, '-', '')) WHERE `slug` IS NULL");
  await queryInterface.changeColumn('articles', 'slug', { type: Sequelize.STRING(220), allowNull: false });
}
