// Runs once before the DB test suite: refuses unsafe targets, then rebuilds the test schema from migrations.
const REQUIRED = ['DB_NAME', 'DB_USER', 'DB_MIGRATOR_USER', 'JWT_ACCESS_SECRET', 'JWT_REFRESH_SECRET'];

export default async function setup() {
  const missing = REQUIRED.filter((key) => !process.env[key]);
  if (missing.length > 0) {
    throw new Error(
      `DB tests need backend/.env.test (copy .env.example, NODE_ENV=test, DB_NAME=NerveAndNectar_test). Missing: ${missing.join(', ')}`,
    );
  }
  // The suite drops every table: make it impossible to point at a real database.
  if (!process.env.DB_NAME.endsWith('_test')) {
    throw new Error(`Refusing to run DB tests against "${process.env.DB_NAME}": the database name must end in _test`);
  }

  process.env.NODE_ENV = 'test';
  const { env } = await import('../../src/config/env.js');
  const { createSequelize } = await import('../../src/config/db.js');
  const { createMigrator } = await import('../../src/db/migrator.js');

  const sequelize = createSequelize({ username: env.DB_MIGRATOR_USER, password: env.DB_MIGRATOR_PASSWORD });
  try {
    const migrator = createMigrator(sequelize);
    // Fresh schema every run: undo everything, then apply all migrations.
    await migrator.down({ to: 0 });
    await migrator.up();
  } finally {
    await sequelize.close();
  }
}
