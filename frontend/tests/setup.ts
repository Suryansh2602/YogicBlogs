import '@testing-library/jest-dom/vitest';
import { cleanup, configure } from '@testing-library/react';
import { afterEach, beforeEach, vi } from 'vitest';
import { resetSessionForTests } from '../src/features/auth/session';

// Pages are lazy-loaded; their first import in a test run can take a few seconds to transform.
configure({ asyncUtilTimeout: 5000 });

// jsdom has no matchMedia; the theme code asks it for the light/dark preference.
beforeEach(() => {
  vi.stubGlobal(
    'matchMedia',
    vi.fn((query: string) => ({
      matches: false,
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  );
});

afterEach(() => {
  cleanup();
  resetSessionForTests();
  localStorage.clear();
  vi.unstubAllGlobals();
});
