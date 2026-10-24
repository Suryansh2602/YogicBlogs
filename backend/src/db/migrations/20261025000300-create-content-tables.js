import { TABLE_OPTIONS, addAliveColumn, addAliveUnique, addCheckIn, fk, timestamps, uuidPk } from '../migrationHelpers.js';

const seo = (Sequelize) => ({
  seo_title: { type: Sequelize.STRING(70), allowNull: true },
  seo_description: { type: Sequelize.STRING(160), allowNull: true },
});

export async function up({ queryInterface, Sequelize }) {
  // Media first: conditions and articles point at it.
  await queryInterface.createTable(
    'media',
    {
      id: uuidPk(Sequelize),
      uploaded_by_id: fk(Sequelize, 'users', { allowNull: true, onDelete: 'SET NULL' }),
      kind: { type: Sequelize.STRING(16), allowNull: false },
      visibility: { type: Sequelize.STRING(16), allowNull: false, defaultValue: 'protected' },
      storage_key: { type: Sequelize.STRING(512), allowNull: false, unique: true },
      variants: { type: Sequelize.JSON, allowNull: true },
      original_name: { type: Sequelize.STRING(255), allowNull: true },
      mime_type: { type: Sequelize.STRING(100), allowNull: false },
      size_bytes: { type: Sequelize.INTEGER.UNSIGNED, allowNull: false },
      checksum_sha256: { type: Sequelize.CHAR(64), allowNull: false },
      width: { type: Sequelize.INTEGER.UNSIGNED, allowNull: true },
      height: { type: Sequelize.INTEGER.UNSIGNED, allowNull: true },
      duration_seconds: { type: Sequelize.INTEGER.UNSIGNED, allowNull: true },
      alt_text: { type: Sequelize.STRING(255), allowNull: true },
      ...timestamps(Sequelize, { deleted: true }),
    },
    TABLE_OPTIONS,
  );
  await addCheckIn(queryInterface, 'media', 'kind', ['image', 'audio']);
  await addCheckIn(queryInterface, 'media', 'visibility', ['public', 'protected']);
  await queryInterface.addIndex('media', ['kind'], { name: 'media_kind' });

  await queryInterface.createTable(
    'conditions',
    {
      id: uuidPk(Sequelize),
      name: { type: Sequelize.STRING(120), allowNull: false },
      slug: { type: Sequelize.STRING(140), allowNull: false },
      summary: { type: Sequelize.STRING(500), allowNull: true },
      description: { type: Sequelize.TEXT, allowNull: true },
      hero_image_id: fk(Sequelize, 'media', { allowNull: true, onDelete: 'SET NULL' }),
      ...seo(Sequelize),
      sort_order: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
      is_published: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
      ...timestamps(Sequelize, { deleted: true }),
    },
    TABLE_OPTIONS,
  );
  await addAliveColumn(queryInterface, 'conditions');
  await addAliveUnique(queryInterface, 'conditions', 'slug');
  await addAliveUnique(queryInterface, 'conditions', 'name');
  await queryInterface.addIndex('conditions', ['is_published', 'sort_order'], { name: 'conditions_published_order' });

  await queryInterface.createTable(
    'articles',
    {
      id: uuidPk(Sequelize),
      condition_id: fk(Sequelize, 'conditions', { onDelete: 'RESTRICT' }),
      author_id: fk(Sequelize, 'users', { allowNull: true, onDelete: 'SET NULL' }),
      title: { type: Sequelize.STRING(200), allowNull: false },
      slug: { type: Sequelize.STRING(220), allowNull: false },
      summary: { type: Sequelize.STRING(500), allowNull: true },
      content_json: { type: Sequelize.JSON, allowNull: true },
      content_html: { type: Sequelize.TEXT('medium'), allowNull: true },
      cover_image_id: fk(Sequelize, 'media', { allowNull: true, onDelete: 'SET NULL' }),
      audio_id: fk(Sequelize, 'media', { allowNull: true, onDelete: 'SET NULL' }),
      status: { type: Sequelize.STRING(16), allowNull: false, defaultValue: 'draft' },
      published_at: { type: Sequelize.DATE, allowNull: true },
      reading_minutes: { type: Sequelize.SMALLINT.UNSIGNED, allowNull: true },
      access_level: { type: Sequelize.STRING(16), allowNull: false, defaultValue: 'members' },
      ...seo(Sequelize),
      version: { type: Sequelize.INTEGER.UNSIGNED, allowNull: false, defaultValue: 0 },
      ...timestamps(Sequelize, { deleted: true }),
    },
    TABLE_OPTIONS,
  );
  await addAliveColumn(queryInterface, 'articles');
  await addAliveUnique(queryInterface, 'articles', 'slug');
  await addCheckIn(queryInterface, 'articles', 'status', ['draft', 'published', 'archived']);
  await addCheckIn(queryInterface, 'articles', 'access_level', ['public', 'members']);
  await queryInterface.addIndex('articles', ['status', 'published_at'], { name: 'articles_status_published' });
  await queryInterface.addIndex('articles', ['condition_id', 'status'], { name: 'articles_condition_status' });
  // Site search over titles and summaries.
  await queryInterface.addIndex('articles', ['title', 'summary'], { type: 'FULLTEXT', name: 'articles_search' });
}

export async function down({ queryInterface }) {
  for (const table of ['articles', 'conditions', 'media']) {
    await queryInterface.dropTable(table);
  }
}
