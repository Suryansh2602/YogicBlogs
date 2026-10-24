import { z } from 'zod';

const secret = z.string().min(32, 'must be at least 32 characters');
// Env vars are strings: parse 'true'/'false'. Defaults must be real booleans (Zod 4 does not re-parse defaults).
const bool = z.enum(['true', 'false']).transform((v) => v === 'true');

// Validate env once at startup so a missing or weak secret fails fast instead of at first use.
const schema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().positive().default(5000),
    // Comma-separated list: the client is deployed separately, possibly on several origins.
    CLIENT_ORIGIN: z
      .string()
      .default('http://localhost:5173')
      .transform((value) => value.split(',').map((o) => o.trim()).filter(Boolean))
      .pipe(z.array(z.url()).min(1)),

    DB_HOST: z.string().min(1).default('localhost'),
    DB_PORT: z.coerce.number().int().positive().default(3306),
    DB_NAME: z.string().min(1),
    // Append-only audit log lives in its own database where the app user may only INSERT/SELECT.
    // Defaults to "<DB_NAME>_audit".
    AUDIT_DB_NAME: z.string().min(1).optional(),
    DB_USER: z.string().min(1),
    DB_PASSWORD: z.string().default(''),
    DB_CONNECTION_LIMIT: z.coerce.number().int().positive().default(10),
    DB_SSL: bool.default(false),
    DB_LOGGING: bool.default(false),
    // Schema changes run as a separate, more privileged user. Falls back to the runtime user.
    DB_MIGRATOR_USER: z.string().min(1).optional(),
    DB_MIGRATOR_PASSWORD: z.string().optional(),

    // Redis is mandatory in production; locally it can be switched off (in-memory fallbacks, no cache).
    REDIS_ENABLED: bool.default(true),
    REDIS_HOST: z.string().min(1).default('127.0.0.1'),
    REDIS_PORT: z.coerce.number().int().positive().default(6379),
    REDIS_PASSWORD: z.string().default(''),
    REDIS_DB: z.coerce.number().int().min(0).max(15).default(0),
    REDIS_TLS: bool.default(false),

    JWT_ACCESS_SECRET: secret,
    JWT_REFRESH_SECRET: secret,
    JWT_ACCESS_EXPIRES_IN: z.string().default('15m'),
    JWT_REFRESH_EXPIRES_IN: z.string().default('7d'),

    UPLOAD_DIR: z.string().default('uploads'),
    MAX_UPLOAD_MB: z.coerce.number().positive().default(5),
  })
  .superRefine((cfg, ctx) => {
    const fail = (path, message) => ctx.addIssue({ code: 'custom', path: [path], message });

    if (cfg.JWT_ACCESS_SECRET === cfg.JWT_REFRESH_SECRET) {
      fail('JWT_REFRESH_SECRET', 'must differ from JWT_ACCESS_SECRET');
    }

    if (cfg.NODE_ENV === 'production') {
      if (!cfg.DB_PASSWORD) fail('DB_PASSWORD', 'is required in production');
      if (cfg.DB_USER === 'root') fail('DB_USER', 'must not be root in production; use a least-privilege user');
      if (!cfg.REDIS_ENABLED) fail('REDIS_ENABLED', 'must be true in production');
      if (!cfg.REDIS_PASSWORD) fail('REDIS_PASSWORD', 'is required in production');
      if (cfg.DB_LOGGING) fail('DB_LOGGING', 'must be false in production (SQL logs can contain personal data)');
      if (cfg.CLIENT_ORIGIN.some((o) => !o.startsWith('https://'))) {
        fail('CLIENT_ORIGIN', 'must use https in production');
      }
    }
  });

export function loadEnv(source = process.env) {
  const parsed = schema.safeParse(source);

  if (!parsed.success) {
    // Report which variables are wrong, never their values.
    const issues = parsed.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`).join('\n');
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }

  return Object.freeze({
    ...parsed.data,
    AUDIT_DB_NAME: parsed.data.AUDIT_DB_NAME ?? `${parsed.data.DB_NAME}_audit`,
    DB_MIGRATOR_USER: parsed.data.DB_MIGRATOR_USER ?? parsed.data.DB_USER,
    DB_MIGRATOR_PASSWORD: parsed.data.DB_MIGRATOR_PASSWORD ?? parsed.data.DB_PASSWORD,
    isProduction: parsed.data.NODE_ENV === 'production',
    isTest: parsed.data.NODE_ENV === 'test',
  });
}

export const env = loadEnv();
