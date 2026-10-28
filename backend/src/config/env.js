import { z } from 'zod';

const secret = z.string().min(32, 'must be at least 32 characters');
// "15m", "7d", "12h", "30s"
const duration = z.string().regex(/^\d+[smhd]$/, 'must look like 30s, 15m, 12h or 7d');
// Exactly 32 random bytes, base64url-encoded (AES-256 key).
const aesKey = z
  .string()
  .refine((v) => Buffer.from(v, 'base64url').length === 32, 'must be 32 bytes, base64url-encoded');
// Env vars are strings: parse 'true'/'false'. Defaults must be real booleans (Zod 4 does not re-parse defaults).
const bool = z.enum(['true', 'false']).transform((v) => v === 'true');

// Validate env once at startup so a missing or weak secret fails fast instead of at first use.
const schema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().positive().default(5000),
    // Optional override; defaults: debug (development), info (production), silent (test).
    LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).optional(),
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

    // Public URL of the frontend: the only base used for links in emails (never the request's Host header).
    APP_URL: z.url().default('http://localhost:5173'),

    JWT_ACCESS_SECRET: secret,
    JWT_REFRESH_SECRET: secret,
    JWT_ACCESS_EXPIRES_IN: duration.default('15m'),
    // Refresh-token lifetimes: idle (each rotation extends it) and absolute (hard session end).
    JWT_REFRESH_EXPIRES_IN: duration.default('7d'),
    SESSION_MAX_AGE: duration.default('30d'),
    // Staff sessions are shorter.
    ADMIN_REFRESH_EXPIRES_IN: duration.default('1d'),
    ADMIN_SESSION_MAX_AGE: duration.default('7d'),
    CSRF_SECRET: secret,
    // Encrypts TOTP secrets at rest. Losing it means every user must re-enrol 2FA: back it up offline.
    TWO_FACTOR_ENC_KEY: aesKey,
    // One-time code for /admin/setup (creating the first admin). If unset, a random one is generated at
    // startup and printed to the server console while no admin exists.
    ADMIN_SETUP_CODE: z.string().min(16).optional(),

    // Email features (verify email, password reset, security alerts). Off until an email provider is set
    // up: sign-up then signs people straight in, and the email routes aren't mounted at all.
    EMAIL_ENABLED: bool.default(false),
    // Email: "outbox" writes messages to backend/.local/outbox (development); "smtp" sends them.
    MAIL_MODE: z.enum(['outbox', 'smtp']).default('outbox'),
    MAIL_FROM: z.string().min(3).default('Healthmarg <no-reply@healthmarg.local>'),
    SMTP_HOST: z.string().optional(),
    SMTP_PORT: z.coerce.number().int().positive().default(587),
    SMTP_SECURE: bool.default(false),
    SMTP_USER: z.string().optional(),
    SMTP_PASSWORD: z.string().optional(),

    // reCAPTCHA v3: "off" only outside production.
    RECAPTCHA_MODE: z.enum(['off', 'live']).default('off'),
    RECAPTCHA_SECRET: z.string().optional(),
    RECAPTCHA_MIN_SCORE: z.coerce.number().min(0).max(1).default(0.5),
    // Login tolerates lower scores (shared mobile IPs) because lockout also protects it.
    RECAPTCHA_LOGIN_MIN_SCORE: z.coerce.number().min(0).max(1).default(0.3),

    // Reject passwords found in known breaches (Have I Been Pwned, k-anonymity: only 5 hash chars leave).
    HIBP_ENABLED: bool.default(true),

    // Media storage on the server's disk (git-ignored, never served statically: only via /api/v1/media).
    UPLOAD_DIR: z.string().default('uploads'),
    // Largest image an admin may upload (it's re-encoded to WebP, so the stored files are much smaller).
    MAX_IMAGE_MB: z.coerce.number().positive().max(50).default(15),
    // Uploads are refused (507) when the disk holding UPLOAD_DIR has less free space than this.
    MIN_FREE_DISK_MB: z.coerce.number().int().nonnegative().default(2048),
  })
  .superRefine((cfg, ctx) => {
    const fail = (path, message) => ctx.addIssue({ code: 'custom', path: [path], message });

    if (cfg.JWT_ACCESS_SECRET === cfg.JWT_REFRESH_SECRET) {
      fail('JWT_REFRESH_SECRET', 'must differ from JWT_ACCESS_SECRET');
    }
    if (cfg.CSRF_SECRET === cfg.JWT_ACCESS_SECRET || cfg.CSRF_SECRET === cfg.JWT_REFRESH_SECRET) {
      fail('CSRF_SECRET', 'must differ from the JWT secrets');
    }
    if (cfg.RECAPTCHA_MODE === 'live' && !cfg.RECAPTCHA_SECRET) {
      fail('RECAPTCHA_SECRET', 'is required when RECAPTCHA_MODE=live');
    }
    if (cfg.MAIL_MODE === 'smtp' && !cfg.SMTP_HOST) fail('SMTP_HOST', 'is required when MAIL_MODE=smtp');

    if (cfg.NODE_ENV === 'production') {
      if (!cfg.DB_PASSWORD) fail('DB_PASSWORD', 'is required in production');
      if (cfg.DB_USER === 'root') fail('DB_USER', 'must not be root in production; use a least-privilege user');
      if (!cfg.REDIS_ENABLED) fail('REDIS_ENABLED', 'must be true in production');
      if (!cfg.REDIS_PASSWORD) fail('REDIS_PASSWORD', 'is required in production');
      if (cfg.DB_LOGGING) fail('DB_LOGGING', 'must be false in production (SQL logs can contain personal data)');
      if (cfg.CLIENT_ORIGIN.some((o) => !o.startsWith('https://'))) {
        fail('CLIENT_ORIGIN', 'must use https in production');
      }
      if (!cfg.APP_URL.startsWith('https://')) fail('APP_URL', 'must use https in production');
      if (cfg.RECAPTCHA_MODE !== 'live') fail('RECAPTCHA_MODE', 'must be live in production');
      if (cfg.EMAIL_ENABLED && cfg.MAIL_MODE !== 'smtp') fail('MAIL_MODE', 'must be smtp in production when EMAIL_ENABLED=true');
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
