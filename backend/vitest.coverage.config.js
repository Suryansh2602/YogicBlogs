import { defineConfig } from 'vitest/config';

// Coverage gate over BOTH suites: the hermetic tests (vitest.config.js) and the real-MySQL tests
// (vitest.db.config.js) each write a blob report; `npm run test:coverage` merges them here and enforces
// the thresholds. Auth and data code is mostly proven against the real database, so neither suite alone
// is the right measure.
export default defineConfig({
  test: {
    coverage: {
      provider: 'v8',
      include: ['src/**/*.js'],
      // Entry point and one-off CLIs/seed data: exercised by hand and by the DB setup, not by unit tests.
      exclude: ['src/server.js', 'src/db/cli.js', 'src/db/seeders/**'],
      thresholds: { lines: 80, functions: 80, branches: 75, statements: 80 },
    },
  },
});
