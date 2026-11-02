// Startup check: migration files on disk that the database hasn't run yet. Code arrives with `git pull`,
// but a new table only exists after `npm run db:migrate`; until then, features that need it fail with
// server errors. Read-only on purpose: Umzug's own check creates its history table, which needs schema
// rights the runtime user doesn't have.
import { readdir } from 'node:fs/promises';
import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';
import { migrationsDir } from './migrator.js';

/** Names of the migrations not yet recorded in `schema_migrations`, oldest first. */
export async function pendingMigrations(sequelize, dir = migrationsDir) {
  // The folder is ours (or a test's temp folder), never from a request.
  // eslint-disable-next-line security/detect-non-literal-fs-filename
  const files = (await readdir(dir)).filter((name) => name.endsWith('.js')).sort();
  let rows;
  try {
    [rows] = await sequelize.query('SELECT name FROM schema_migrations');
  } catch (err) {
    // A brand-new database: no migration has ever run.
    if ((err.original ?? err.parent ?? err).code === 'ER_NO_SUCH_TABLE') return files;
    throw err;
  }
  const done = new Set(rows.map((row) => row.name));
  return files.filter((name) => !done.has(name));
}

/** Logs a clear warning naming any pending migrations. Never stops the server from starting. */
export async function warnAboutPendingMigrations(sequelize, { log = logger, dir } = {}) {
  try {
    const pending = await pendingMigrations(sequelize, dir);
    if (!pending.length) return pending;
    const steps = pending.length === 1 ? '1 setup step' : `${pending.length} setup steps`;
    const level = env.isProduction ? 'error' : 'warn';
    log[level](
      { pending },
      `The database is missing ${steps}. Some features will fail with server errors until you run "npm run db:migrate" in backend.`,
    );
    return pending;
  } catch (err) {
    log.warn({ err }, 'Could not check the database for pending migrations');
    return undefined;
  }
}
