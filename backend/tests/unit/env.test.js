import { describe, expect, it } from 'vitest';
import { loadEnv } from '../../src/config/env.js';

const valid = {
  DB_NAME: 'db',
  DB_USER: 'user',
  JWT_ACCESS_SECRET: 'a'.repeat(32),
  JWT_REFRESH_SECRET: 'b'.repeat(32),
};

const production = {
  ...valid,
  NODE_ENV: 'production',
  DB_USER: 'nerve_app',
  DB_PASSWORD: 'strong-password',
  REDIS_PASSWORD: 'redis-password',
  CLIENT_ORIGIN: 'https://nervenector.example',
};

describe('loadEnv', () => {
  it('applies defaults and coerces numbers', () => {
    const env = loadEnv({ ...valid, PORT: '8080' });
    expect(env.PORT).toBe(8080);
    expect(env.DB_PORT).toBe(3306);
    expect(env.DB_SSL).toBe(false);
    expect(env.NODE_ENV).toBe('development');
    expect(env.isProduction).toBe(false);
  });

  it('parses CLIENT_ORIGIN as a comma-separated allow-list', () => {
    const env = loadEnv({ ...valid, CLIENT_ORIGIN: 'http://a.test, http://b.test' });
    expect(env.CLIENT_ORIGIN).toEqual(['http://a.test', 'http://b.test']);
  });

  it('rejects an invalid origin', () => {
    expect(() => loadEnv({ ...valid, CLIENT_ORIGIN: 'not a url' })).toThrow(/CLIENT_ORIGIN/);
  });

  it('rejects short JWT secrets', () => {
    expect(() => loadEnv({ ...valid, JWT_ACCESS_SECRET: 'short' })).toThrow(/JWT_ACCESS_SECRET/);
  });

  it('rejects identical access and refresh secrets', () => {
    expect(() => loadEnv({ ...valid, JWT_REFRESH_SECRET: valid.JWT_ACCESS_SECRET })).toThrow(
      /must differ/,
    );
  });

  it('rejects missing database credentials', () => {
    const { DB_NAME: _omit, ...rest } = valid;
    expect(() => loadEnv(rest)).toThrow(/DB_NAME/);
  });

  it('never includes secret values in the error message', () => {
    const leaked = 'super-secret-value';
    try {
      loadEnv({ ...valid, JWT_ACCESS_SECRET: leaked });
      expect.unreachable();
    } catch (err) {
      expect(err.message).not.toContain(leaked);
    }
  });

  it('defaults Redis settings and falls back to the runtime DB user for migrations', () => {
    const env = loadEnv(valid);
    expect(env.REDIS_HOST).toBe('127.0.0.1');
    expect(env.REDIS_PORT).toBe(6379);
    expect(env.REDIS_DB).toBe(0);
    expect(env.REDIS_TLS).toBe(false);
    expect(env.REDIS_ENABLED).toBe(true);
    expect(env.AUDIT_DB_NAME).toBe('db_audit');
    expect(env.DB_SSL).toBe(false); // regression: zod 4 defaults are not re-parsed
    expect(env.DB_LOGGING).toBe(false);
    expect(env.DB_MIGRATOR_USER).toBe('user');
  });

  it('uses a dedicated migrator user when given', () => {
    const env = loadEnv({ ...valid, DB_MIGRATOR_USER: 'migrator', DB_MIGRATOR_PASSWORD: 'pw' });
    expect(env.DB_MIGRATOR_USER).toBe('migrator');
    expect(env.DB_MIGRATOR_PASSWORD).toBe('pw');
  });

  it('rejects an out-of-range Redis DB index', () => {
    expect(() => loadEnv({ ...valid, REDIS_DB: '16' })).toThrow(/REDIS_DB/);
  });

  it('returns a frozen object', () => {
    expect(Object.isFrozen(loadEnv(valid))).toBe(true);
  });

  describe('in production', () => {
    it('accepts a hardened configuration', () => {
      expect(loadEnv(production).isProduction).toBe(true);
    });

    it('requires a database password', () => {
      expect(() => loadEnv({ ...production, DB_PASSWORD: '' })).toThrow(/DB_PASSWORD/);
    });

    it('refuses the root database user', () => {
      expect(() => loadEnv({ ...production, DB_USER: 'root' })).toThrow(/root/);
    });

    it('requires Redis to be enabled', () => {
      expect(() => loadEnv({ ...production, REDIS_ENABLED: 'false' })).toThrow(/REDIS_ENABLED/);
    });

    it('requires a Redis password', () => {
      expect(() => loadEnv({ ...production, REDIS_PASSWORD: '' })).toThrow(/REDIS_PASSWORD/);
    });

    it('refuses SQL logging (it can contain personal data)', () => {
      expect(() => loadEnv({ ...production, DB_LOGGING: 'true' })).toThrow(/DB_LOGGING/);
    });

    it('requires https client origins', () => {
      expect(() => loadEnv({ ...production, CLIENT_ORIGIN: 'http://nervenector.example' })).toThrow(
        /https/,
      );
    });
  });
});
