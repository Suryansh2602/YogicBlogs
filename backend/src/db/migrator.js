import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { Sequelize } from 'sequelize';
import { SequelizeStorage, Umzug } from 'umzug';
import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';

const here = dirname(fileURLToPath(import.meta.url));

function createUmzug(sequelize, { folder, tableName, auditDatabase = env.AUDIT_DB_NAME }) {
  return new Umzug({
    migrations: {
      glob: [`${folder}/*.js`, { cwd: here }],
      // ESM migrations: load by file URL so Windows paths work.
      resolve: ({ name, path: filePath, context }) => {
        const load = () => import(pathToFileURL(filePath).href);
        return {
          name,
          up: async () => (await load()).up(context),
          down: async () => (await load()).down(context),
        };
      },
    },
    context: { queryInterface: sequelize.getQueryInterface(), Sequelize, sequelize, auditDatabase },
    storage: new SequelizeStorage({ sequelize, tableName }),
    logger: {
      info: (event) => logger.info(event, 'migration'),
      warn: (event) => logger.warn(event, 'migration'),
      error: (event) => logger.error(event, 'migration'),
      debug: () => {},
    },
  });
}

/** Schema migrations, recorded in the `schema_migrations` table. */
export const createMigrator = (sequelize) =>
  createUmzug(sequelize, { folder: 'migrations', tableName: 'schema_migrations' });

/** Seed data (sample conditions etc.), recorded in `schema_seeds` so each seed runs once. */
export const createSeeder = (sequelize) => createUmzug(sequelize, { folder: 'seeders', tableName: 'schema_seeds' });

export const migrationsDir = join(here, 'migrations');
