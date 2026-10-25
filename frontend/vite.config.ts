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
      coverage: {
        provider: 'v8',
        include: ['src/**/*.{ts,tsx}', 'config/**/*.ts'],
        exclude: ['src/main.tsx', 'src/**/*.d.ts'],
        thresholds: { lines: 80, functions: 80, branches: 75, statements: 80 },
      },
    },
  };
});
