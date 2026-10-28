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
    testTimeout: 20_000,
    hookTimeout: 60_000,
    env: { NODE_ENV: 'test' },
  },
});
