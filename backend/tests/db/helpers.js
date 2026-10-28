import { env } from '../../src/config/env.js';
import { createSequelize } from '../../src/config/db.js';
import { initModels } from '../../src/db/models/index.js';

/** Connections as the runtime (least-privilege) user (app DB + audit DB), with models registered. */
export function connectAsApp() {
  const sequelize = createSequelize();
  const auditSequelize = createSequelize({ database: env.AUDIT_DB_NAME, poolMax: 2 });
  return {
    sequelize,
    auditSequelize,
    models: initModels(sequelize, { auditSequelize }),
    close: () => Promise.all([sequelize.close(), auditSequelize.close()]),
  };
}

/** Connection as the migrator user, for schema inspection and resetting data. */
export function connectAsMigrator() {
  return createSequelize({ username: env.DB_MIGRATOR_USER, password: env.DB_MIGRATOR_PASSWORD });
}

const TABLES_CHILD_FIRST = [
  'reading_progress',
  'article_bookmarks',
  'article_slug_redirects',
  'article_revisions',
  'article_media',
  'article_references',
  'article_drafts',
  'articles',
  'conditions',
  'media',
  'user_consents',
  'auth_tokens',
  'two_factor_backup_codes',
  'user_two_factor',
  'refresh_tokens',
  'oauth_accounts',
  'users',
];

/**
 * Empty every table, children first. Uses the migrator connection: the app user is
 * deliberately not allowed to delete audit entries.
 */
export async function resetTables(migrator) {
  for (const table of TABLES_CHILD_FIRST) {
    await migrator.query(`DELETE FROM \`${table}\``);
  }
  await migrator.query(`DELETE FROM \`${env.AUDIT_DB_NAME}\`.\`audit_logs\``);
}

let counter = 0;
const unique = (prefix) => `${prefix}-${process.pid}-${(counter += 1)}`;

export const makeUser = (models, overrides = {}) =>
  models.User.create({ email: `${unique('user')}@example.com`, displayName: 'Test User', ...overrides });

export const makeCondition = (models, overrides = {}) => {
  const slug = unique('condition');
  return models.Condition.create({ name: slug, slug, ...overrides });
};

export const inOneMinute = () => new Date(Date.now() + 60_000);
