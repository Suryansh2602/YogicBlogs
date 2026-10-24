import { TABLE_OPTIONS, fk, timestamps } from '../migrationHelpers.js';

export async function up({ queryInterface, Sequelize }) {
  await queryInterface.createTable(
    'article_bookmarks',
    {
      user_id: fk(Sequelize, 'users', { primaryKey: true }),
      article_id: fk(Sequelize, 'articles', { primaryKey: true }),
      ...timestamps(Sequelize, { updated: false }),
    },
    TABLE_OPTIONS,
  );

  await queryInterface.createTable(
    'reading_progress',
    {
      user_id: fk(Sequelize, 'users', { primaryKey: true }),
      article_id: fk(Sequelize, 'articles', { primaryKey: true }),
      progress_percent: { type: Sequelize.TINYINT.UNSIGNED, allowNull: false, defaultValue: 0 },
      audio_position_seconds: { type: Sequelize.INTEGER.UNSIGNED, allowNull: false, defaultValue: 0 },
      completed_at: { type: Sequelize.DATE, allowNull: true },
      last_viewed_at: { type: Sequelize.DATE, allowNull: false },
      ...timestamps(Sequelize),
    },
    TABLE_OPTIONS,
  );
  // "Continue reading" on the user dashboard.
  await queryInterface.addIndex('reading_progress', ['user_id', 'last_viewed_at'], { name: 'reading_progress_recent' });
}

export async function down({ queryInterface }) {
  await queryInterface.dropTable('reading_progress');
  await queryInterface.dropTable('article_bookmarks');
}
