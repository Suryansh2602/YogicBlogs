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
  poolMax = env.DB_CONNECTION_LIMIT,
} = {}) {
  return new Sequelize(database, username, password, {
    dialect: 'mysql',
    host: env.DB_HOST,
    port: env.DB_PORT,
    timezone: '+00:00',
    // SQL logging can include row values, so it is debug-only and refused in production (config/env.js).
    logging: env.DB_LOGGING ? (sql) => logger.debug({ sql }, 'sql') : false,
    pool: { max: poolMax, min: 0, acquire: 30_000, idle: 10_000 },
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
// The audit log lives in its own database (the app user may only INSERT/SELECT there). Sequelize can't
// address another MySQL database from one instance, so the audit model gets its own small pool.
export const auditSequelize = createSequelize({ database: env.AUDIT_DB_NAME, poolMax: 3 });
export const models = initModels(sequelize, { auditSequelize });

export async function pingDatabase() {
  await sequelize.authenticate({ logging: false });
}

export async function closeDatabase() {
  await Promise.all([sequelize.close(), auditSequelize.close()]);
}
