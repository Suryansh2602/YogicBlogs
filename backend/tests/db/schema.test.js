import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { env } from '../../src/config/env.js';
import { createMigrator } from '../../src/db/migrator.js';
import { connectAsApp, connectAsMigrator } from './helpers.js';

const APP_TABLES = [
  'article_bookmarks',
  'articles',
  'auth_tokens',
  'conditions',
  'media',
  'oauth_accounts',
  'reading_progress',
  'refresh_tokens',
  'schema_migrations',
  'two_factor_backup_codes',
  'user_consents',
  'user_two_factor',
  'users',
];

// Generated columns exist only in MySQL (uniqueness among non-deleted rows); models never write them.
const DB_ONLY_COLUMNS = ['alive'];

const tablesIn = async (sequelize, database) => {
  const [rows] = await sequelize.query(
    'SELECT TABLE_NAME AS name, ENGINE AS engine, TABLE_COLLATION AS collation FROM information_schema.TABLES WHERE TABLE_SCHEMA = :db ORDER BY TABLE_NAME',
    { replacements: { db: database } },
  );
  return rows;
};

describe('schema (migrations)', () => {
  let migrator;

  beforeAll(() => {
    migrator = connectAsMigrator();
  });

  afterAll(async () => {
    await migrator.close();
  });

  it('creates every app table, all utf8mb4 InnoDB', async () => {
    const rows = await tablesIn(migrator, env.DB_NAME);
    expect(rows.map((r) => r.name)).toEqual(APP_TABLES);
    for (const row of rows) {
      expect(row.engine).toBe('InnoDB');
      expect(row.collation).toMatch(/^utf8mb4_/);
    }
  });

  it('creates the audit log in the separate audit database', async () => {
    const rows = await tablesIn(migrator, env.AUDIT_DB_NAME);
    expect(rows.map((r) => r.name)).toEqual(['audit_logs']);
  });

  it('has no pending migrations', async () => {
    expect(await createMigrator(migrator).pending()).toEqual([]);
  });

  it('every migration rolls back and re-applies cleanly', async () => {
    const umzug = createMigrator(migrator);
    const executed = await umzug.executed();
    await umzug.down({ to: 0 });
    const left = (await tablesIn(migrator, env.DB_NAME)).map((r) => r.name);
    expect(left).toEqual(['schema_migrations']);
    expect(await tablesIn(migrator, env.AUDIT_DB_NAME)).toEqual([]);
    await umzug.up();
    expect((await umzug.executed()).length).toBe(executed.length);
  });

  it('models match the migrated columns (no drift)', async () => {
    const { sequelize, models } = connectAsApp();
    try {
      const qi = sequelize.getQueryInterface();
      for (const model of Object.values(models)) {
        const columns = Object.keys(await qi.describeTable(model.getTableName()));
        const attributes = Object.values(model.getAttributes()).map((a) => a.field);
        expect(columns.filter((c) => !DB_ONLY_COLUMNS.includes(c)).sort(), model.name).toEqual(attributes.sort());
      }
    } finally {
      await sequelize.close();
    }
  });

  it('enforces allowed values with CHECK constraints, not just in JS', async () => {
    const now = new Date();
    await expect(
      migrator.query(
        "INSERT INTO users (id, email, display_name, role, created_at, updated_at) VALUES (UUID(), 'x@example.com', 'X', 'superuser', :now, :now)",
        { replacements: { now } },
      ),
    ).rejects.toThrow(/check constraint/i);
  });
});

describe('least privilege', () => {
  let app;

  beforeAll(() => {
    app = connectAsApp().sequelize;
  });

  afterAll(async () => {
    await app.close();
  });

  it('the runtime app user cannot change the schema', async () => {
    await expect(app.query('CREATE TABLE should_not_exist (id INT)')).rejects.toThrow(/denied/i);
    await expect(app.query('DROP TABLE users')).rejects.toThrow(/denied/i);
  });

  it('the runtime app user can append to the audit log but never edit or delete it', async () => {
    const table = `\`${env.AUDIT_DB_NAME}\`.\`audit_logs\``;
    await app.query(`INSERT INTO ${table} (action, created_at) VALUES ('test.append', NOW())`);
    await expect(app.query(`UPDATE ${table} SET action = 'tampered'`)).rejects.toThrow(/denied/i);
    await expect(app.query(`DELETE FROM ${table}`)).rejects.toThrow(/denied/i);
  });

  it('rejects multiple statements in one query (stacked SQL injection)', async () => {
    await expect(app.query('SELECT 1; SELECT 2')).rejects.toThrow();
  });
});
