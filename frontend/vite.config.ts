import { defineConfig } from 'vitest/config';
import { loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { assertNoSecretsInClientEnv } from './config/envGuard.ts';

export default defineConfig(({ mode }) => {
  assertNoSecretsInClientEnv(loadEnv(mode, process.cwd(), 'VITE_'));

  return {
    plugins: [react()],
    server: {
      port: 5173,
      // Test and build output isn't app code: without this, every test run's coverage report made the
      // dev server reload the open browser tab.
      watch: { ignored: ['**/coverage/**', '**/dist/**'] },
    },
    build: {
      // No source maps in production: they would publish the original source.
      sourcemap: false,
    },
    test: {
      environment: 'jsdom',
      include: ['tests/**/*.test.{ts,tsx}'],
      setupFiles: ['./tests/setup.ts'],
      restoreMocks: true,
      // Page tests type into real forms and load lazy routes; generous, but still catches hangs.
      testTimeout: 20_000,
      // Most page tests cover the email flows; tests switch it off with vi.stubEnv where needed.
      env: { VITE_FEATURE_EMAIL: 'true' },
      coverage: {
        provider: 'v8',
        include: ['src/**/*.{ts,tsx}', 'config/**/*.ts'],
        exclude: ['src/main.tsx', 'src/**/*.d.ts'],
        thresholds: { lines: 80, functions: 80, branches: 75, statements: 80 },
      },
    },
  };
});
