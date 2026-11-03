// The startup check for a database that is behind the code: what counts as pending, and what gets logged.
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { pendingMigrations, warnAboutPendingMigrations } from '../../src/db/pendingMigrations.js';

const FILES = ['20261025000100-create-users.js', '20261027000100-articles-drafts.js', '20261030000100-admin-security.js'];

let dir;
beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), 'healthmarg-migrations-'));
  // Written out of order, plus a file that isn't a migration.
  for (const name of [...FILES].reverse()) await writeFile(join(dir, name), 'export async function up() {}');
  await writeFile(join(dir, 'README.md'), 'not a migration');
});
afterAll(async () => {
  await rm(dir, { recursive: true, force: true });
});

/** A stand-in for Sequelize: returns the given history rows, or throws the given error. */
const fakeDb = (result) => ({
  query: vi.fn(async () => {
    if (result instanceof Error) throw result;
    return [result.map((name) => ({ name })), undefined];
  }),
});

const dbError = (code) => Object.assign(new Error(code), { original: { code } });

const fakeLog = () => ({ warn: vi.fn(), error: vi.fn() });

describe('pendingMigrations', () => {
  it('lists the files the database has not run, oldest first, ignoring other files', async () => {
    const db = fakeDb(FILES.slice(0, 2));
    expect(await pendingMigrations(db, dir)).toEqual(['20261030000100-admin-security.js']);
    expect(db.query).toHaveBeenCalledWith('SELECT name FROM schema_migrations'); // read-only
  });

  it('returns nothing when the database is up to date', async () => {
    expect(await pendingMigrations(fakeDb(FILES), dir)).toEqual([]);
  });

  it('treats a database with no history table as needing every migration', async () => {
    expect(await pendingMigrations(fakeDb(dbError('ER_NO_SUCH_TABLE')), dir)).toEqual(FILES);
  });

  it('passes other database errors on', async () => {
    await expect(pendingMigrations(fakeDb(dbError('ER_TABLEACCESS_DENIED_ERROR')), dir)).rejects.toThrow('ER_TABLEACCESS_DENIED_ERROR');
  });
});

describe('warnAboutPendingMigrations', () => {
  it('names the missing steps and the command that fixes them', async () => {
    const log = fakeLog();
    await warnAboutPendingMigrations(fakeDb(FILES.slice(0, 2)), { log, dir });
    expect(log.warn).toHaveBeenCalledTimes(1);
    const [fields, message] = log.warn.mock.calls[0];
    expect(fields).toEqual({ pending: ['20261030000100-admin-security.js'] });
    expect(message).toBe(
      'The database is missing 1 setup step. Some features will fail with server errors until you run "npm run db:migrate" in backend.',
    );
  });

  it('counts several steps in words', async () => {
    const log = fakeLog();
    await warnAboutPendingMigrations(fakeDb(dbError('ER_NO_SUCH_TABLE')), { log, dir });
    expect(log.warn.mock.calls[0][1]).toMatch(/^The database is missing 3 setup steps\./);
  });

  it('stays quiet when nothing is pending', async () => {
    const log = fakeLog();
    expect(await warnAboutPendingMigrations(fakeDb(FILES), { log, dir })).toEqual([]);
    expect(log.warn).not.toHaveBeenCalled();
    expect(log.error).not.toHaveBeenCalled();
  });

  it('never stops the server: a failed check is a warning, not a crash', async () => {
    const log = fakeLog();
    await expect(warnAboutPendingMigrations(fakeDb(dbError('ER_TABLEACCESS_DENIED_ERROR')), { log, dir })).resolves.toBeUndefined();
    expect(log.warn).toHaveBeenCalledWith(expect.objectContaining({ err: expect.any(Error) }), 'Could not check the database for pending migrations');
  });

  it('logs an error, not a warning, in production', async () => {
    vi.resetModules();
    vi.doMock('../../src/config/env.js', async (importOriginal) => {
      const actual = await importOriginal();
      return { ...actual, env: { ...actual.env, isProduction: true } };
    });
    try {
      const { warnAboutPendingMigrations: warnInProduction } = await import('../../src/db/pendingMigrations.js');
      const log = fakeLog();
      await warnInProduction(fakeDb([]), { log, dir });
      expect(log.error).toHaveBeenCalledTimes(1);
      expect(log.warn).not.toHaveBeenCalled();
    } finally {
      vi.doUnmock('../../src/config/env.js');
      vi.resetModules();
    }
  });
});
