import { existsSync } from 'node:fs';
import { defineConfig } from 'vitest/config';

// Real-service tests: MySQL test database + Redis. Credentials come from backend/.env.test (git-ignored).
if (existsSync('.env.test')) process.loadEnvFile('.env.test');

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/db/**/*.test.js'],
    // One shared database: run files one after another, never in parallel.
    fileParallelism: false,
    globalSetup: ['./tests/db/globalSetup.js'],
    restoreMocks: true,
    coverage: { provider: 'v8', include: ['src/**/*.js'], exclude: ['src/server.js', 'src/db/cli.js', 'src/db/seeders/**'] },
    testTimeout: 20_000,
    hookTimeout: 60_000,
    // Fixed setup code so the admin bootstrap can be tested; never a real value.
    // EMAIL_ENABLED=true for the email flows; auth-no-email.test.js switches it off for itself.
    env: { NODE_ENV: 'test', ADMIN_SETUP_CODE: 'test-only-admin-setup-code', EMAIL_ENABLED: 'true' },
  },
});
