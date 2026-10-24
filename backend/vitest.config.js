import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/unit/**/*.test.js', 'tests/integration/**/*.test.js'],
    // tests/db needs real MySQL + Redis: run with npm run test:db
    restoreMocks: true,
    // Test-only values so config/env.js validates without a real .env file.
    env: {
      NODE_ENV: 'test',
      DB_NAME: 'NerveAndNectar_test',
      DB_USER: 'test',
      JWT_ACCESS_SECRET: 'test-access-secret-at-least-32-characters',
      JWT_REFRESH_SECRET: 'test-refresh-secret-at-least-32-characters',
    },
    coverage: {
      provider: 'v8',
      include: ['src/**/*.js'],
      exclude: ['src/server.js'],
      thresholds: { lines: 80, functions: 80, branches: 75, statements: 80 },
    },
  },
});
