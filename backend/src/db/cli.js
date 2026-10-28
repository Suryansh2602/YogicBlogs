// Database CLI. Runs as the migrator user (schema rights), never the runtime app user.
//   npm run db:migrate          apply pending migrations
//   npm run db:migrate:undo     roll back the last migration
//   npm run db:migrate:status   list executed and pending migrations
//   npm run db:seed             apply pending seeds (refused in production)
import { env } from '../config/env.js';
import { createSequelize } from '../config/db.js';
import { createMigrator, createSeeder } from './migrator.js';
import { logger } from '../utils/logger.js';

const command = process.argv[2];

const sequelize = createSequelize({ username: env.DB_MIGRATOR_USER, password: env.DB_MIGRATOR_PASSWORD });
const migrator = createMigrator(sequelize);
const seeder = createSeeder(sequelize);

const names = (list) => list.map((m) => m.name);

const commands = {
  up: async () => logger.info({ applied: names(await migrator.up()) }, 'Migrations applied'),
  down: async () => logger.info({ reverted: names(await migrator.down()) }, 'Migration reverted'),
  status: async () =>
    logger.info(
      { executed: names(await migrator.executed()), pending: names(await migrator.pending()) },
      'Migration status',
    ),
  seed: async () => {
    if (env.isProduction) throw new Error('Seeding sample data is disabled in production');
    logger.info({ applied: names(await seeder.up()) }, 'Seeds applied');
  },
};

if (!commands[command]) {
  logger.error(`Unknown command "${command}". Use one of: ${Object.keys(commands).join(', ')}`);
  process.exit(1);
}

try {
  await commands[command]();
} catch (err) {
  logger.fatal({ err }, `db ${command} failed`);
  process.exitCode = 1;
} finally {
  await sequelize.close();
}
