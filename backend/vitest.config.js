import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/unit/**/*.test.js', 'tests/integration/**/*.test.js', 'tests/security/**/*.test.js'],
    // tests/db needs real MySQL + Redis: run with npm run test:db
    restoreMocks: true,
    // Test-only values so config/env.js validates without a real .env file.
    env: {
      NODE_ENV: 'test',
      DB_NAME: 'healthmarg_test',
      DB_USER: 'test',
      JWT_ACCESS_SECRET: 'test-access-secret-at-least-32-characters',
      JWT_REFRESH_SECRET: 'test-refresh-secret-at-least-32-characters',
      CSRF_SECRET: 'test-csrf-secret-at-least-32-characters-long',
      // 32 zero-ish bytes, base64url: test-only key.
      TWO_FACTOR_ENC_KEY: 'dGVzdC1rZXktMzItYnl0ZXMtZm9yLWFlcy0yNTYtZ2M',
      HIBP_ENABLED: 'false',
      // Most auth tests cover the email flows; tests/db/auth-no-email.test.js covers EMAIL_ENABLED=false.
      EMAIL_ENABLED: 'true',
      // Never the real uploads folder.
      UPLOAD_DIR: join(tmpdir(), 'healthmarg-unit-uploads'),
    },
    // Thresholds are enforced on the merged unit + DB coverage: see vitest.coverage.config.js.
    coverage: { provider: 'v8', include: ['src/**/*.js'], exclude: ['src/server.js', 'src/db/cli.js', 'src/db/seeders/**'] },
  },
});
