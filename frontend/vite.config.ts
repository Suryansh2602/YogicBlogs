import { defineConfig } from 'vitest/config';
import { loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { assertNoSecretsInClientEnv } from './config/envGuard.ts';
import { seoPlugin } from './config/seoPlugin.ts';
import { prerenderPlugin } from './config/prerenderPlugin.ts';

export default defineConfig(({ mode }) => {
  const clientEnv = loadEnv(mode, process.cwd(), 'VITE_');
  assertNoSecretsInClientEnv(clientEnv);

  return {
    // seoPlugin writes the page copies first; prerenderPlugin then fills them with each page's HTML.
    plugins: [react(), seoPlugin(clientEnv.VITE_SITE_URL), prerenderPlugin()],
    server: {
      port: 5173,
      // Test and build output isn't app code: without this, every test run's coverage report made the
      // dev server reload the open browser tab.
      watch: { ignored: ['**/coverage/**', '**/dist/**'] },
    },
    // `vite preview` (used by the browser tests) sends the CSP recommended for production in docs/security.md,
    // with any local API port, so the tests catch anything that policy would block.
    preview: {
      headers: {
        'Content-Security-Policy': "default-src 'self'; connect-src 'self' http://localhost:*; img-src 'self' data: http://localhost:*",
      },
    },
    build: {
      // No source maps in production: they would publish the original source.
      sourcemap: false,
      // Which chunks each page loads: read by scripts/check-bundle-size.mjs (editor budget, and proof
      // that reader pages never load the editor). Lives in dist/.vite/, not served by the app's routes.
      manifest: true,
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
      // CSS is skipped in tests except the files the contrast test reads (?raw): theme tokens, season strip.
      css: { include: [/styles[\\/]tokens\.css/, /ritu[\\/]seasonStrip\.css/] },
      coverage: {
        provider: 'v8',
        include: ['src/**/*.{ts,tsx}', 'config/**/*.ts'],
        exclude: ['src/main.tsx', 'src/**/*.d.ts'],
        thresholds: { lines: 80, functions: 80, branches: 75, statements: 80 },
      },
    },
  };
});
