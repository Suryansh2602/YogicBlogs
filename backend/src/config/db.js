import { Sequelize } from 'sequelize';
import { env } from './env.js';
import { logger } from '../utils/logger.js';
import { initModels } from '../db/models/index.js';

/**
 * Build a Sequelize instance. The app uses the least-privilege runtime user;
 * migrations and DB tests pass the migrator credentials instead.
 */
export function createSequelize({
  database = env.DB_NAME,
  username = env.DB_USER,
  password = env.DB_PASSWORD,
} = {}) {
  return new Sequelize(database, username, password, {
    dialect: 'mysql',
    host: env.DB_HOST,
    port: env.DB_PORT,
    timezone: '+00:00',
    // SQL logging can include row values, so it is debug-only and refused in production (config/env.js).
    logging: env.DB_LOGGING ? (sql) => logger.debug({ sql }, 'sql') : false,
    pool: { max: env.DB_CONNECTION_LIMIT, min: 0, acquire: 30_000, idle: 10_000 },
    dialectOptions: {
      // Never allow several statements in one query: closes off stacked-query SQL injection.
      multipleStatements: false,
      charset: 'utf8mb4',
      ...(env.DB_SSL && { ssl: { rejectUnauthorized: true } }),
    },
    define: {
      underscored: true,
      charset: 'utf8mb4',
      collate: 'utf8mb4_0900_ai_ci',
    },
  });
}

export const sequelize = createSequelize();
export const models = initModels(sequelize, { auditSchema: env.AUDIT_DB_NAME });

export async function pingDatabase() {
  await sequelize.authenticate({ logging: false });
}

export async function closeDatabase() {
  await sequelize.close();
}
