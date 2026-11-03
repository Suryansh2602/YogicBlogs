// Prerendered pages (docs/page-speed.md): the HTML the build makes must hydrate with no mismatch, even when
// the visitor's browser differs from the build (another season, a saved theme and place, reduced motion,
// signed in, ?ritu= in the address), and the page must then show the visitor's own details.
import { rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import { act, screen, waitFor, within } from '@testing-library/react';
import type { Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildServerEntry, inlineStyles, unfinishedParts, type ServerEntry } from '../../config/prerenderPlugin';
import { RITU_NAMES } from '../../src/features/ritu/names';
import { PRERENDER_PATHS } from '../../src/prerender/paths';
import { startApp } from '../../src/startApp';
import { makeUser, mockApi, session } from '../helpers/api';

const BUILT = Date.UTC(2026, 9, 20, 6, 0); // 20 October 2026: Sharad
const VISIT = Date.UTC(2026, 11, 20, 6, 0); // 20 December 2026: Hemanta

let root: Root | undefined;
let container: HTMLElement | undefined;
const problems: unknown[] = [];

// The pages are rendered by a production server build of the app with its own copy of React, as the real
// build does (tests run from frontend/).
const SERVER_DIR = resolve('node_modules/.healthmarg-prerender-test');
let server: ServerEntry;
const renderPage = (path: string, at: number) => server.renderPage(path, at);
beforeAll(async () => {
  server = await buildServerEntry({ root: resolve('.'), mode: 'production', outDir: SERVER_DIR, isolated: true });
}, 120_000);
afterAll(async () => {
  await rm(SERVER_DIR, { recursive: true, force: true });
});

beforeEach(() => {
  problems.length = 0;
  mockApi({
    'GET /articles': { body: { items: [], nextCursor: null } },
    'GET /conditions': { body: { items: [] } },
    'GET /auth/csrf': { body: { csrfToken: 'csrf-token' } },
    'POST /auth/refresh': session(makeUser({ displayName: 'Meera Iyer' })),
  });
  vi.spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
    problems.push(args);
  });
});

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  container?.remove();
  root = undefined;
  container = undefined;
  document.documentElement.removeAttribute('data-theme');
  vi.useRealTimers();
});

/** Builds the page as the build does, lets `visitor` change the browser, then hydrates it at `address`. */
async function hydrate(address: string, visitor?: () => void) {
  const path = address.split('?')[0] ?? address;
  const markup = await renderPage(path, BUILT);
  visitor?.();
  window.history.replaceState(null, '', address);
  container = document.createElement('div');
  container.id = 'root';
  container.dataset['prerendered'] = path;
  container.dataset['renderedAt'] = String(BUILT);
  container.innerHTML = markup;
  document.body.append(container);
  const target = container;
  // The prerendered heading: if React threw the HTML away and rebuilt it, this node would be gone.
  const heading = target.querySelector('main h1');
  await act(async () => {
    root = await startApp(target, {
      onRecoverableError: (error) => {
        problems.push(error);
      },
    });
  });
  return { page: target, heading };
}

/** React kept the prerendered HTML: the same heading element is still in the page. */
async function expectKept(page: HTMLElement, heading: Element | null) {
  expect(heading).not.toBeNull();
  await waitFor(() => {
    expect(page.querySelector('main h1')).toBe(heading);
  });
}

describe('prerendered pages', () => {
  it.each(PRERENDER_PATHS)('%s hydrates the build’s HTML with no mismatch', async (path) => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(BUILT);
    const { page, heading } = await hydrate(path);
    await expectKept(page, heading);
    // Let the sign-in check and the latest articles settle: an update must not make React rebuild the page.
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
    });
    expect(page.querySelector('main h1')).toBe(heading);
    expect(page.querySelector('.page-loader')).toBeNull();
    expect(problems).toEqual([]);
  });

  it('shows the visitor’s day, place, theme, motion setting and account after hydrating Home', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(VISIT);
    const { page, heading } = await hydrate('/', () => {
      localStorage.setItem('hm-theme', 'ratri');
      document.documentElement.setAttribute('data-theme', 'ratri'); // what theme-init.js does before paint
      localStorage.setItem('hm-place', JSON.stringify({ name: 'Your location', latitude: 12.97, longitude: 77.59, timeZone: 'Asia/Kolkata' }));
      localStorage.setItem('hm-signed-in', '1');
      vi.stubGlobal('matchMedia', (query: string) => ({
        matches: query.includes('reduced-motion'),
        media: query,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      }));
    });
    const hemanta = RITU_NAMES.hemanta.name;
    await waitFor(() => {
      expect(page.querySelector('.hero__season-name')).toHaveTextContent(hemanta);
    });
    expect(page.querySelector('.season-strip')).toHaveClass('season-strip--hemanta');
    expect(page.querySelector('.season-strip')?.textContent).toContain('Your location');
    // Reduced motion: the slogan stands still, so its Pause button goes.
    expect(screen.queryByRole('button', { name: /pause the headline/i })).not.toBeInTheDocument();
    // Signed in: the account links (header and footer) replace the loading placeholder and "Join free".
    expect(await within(page).findAllByRole('link', { name: 'My path' })).toHaveLength(2);
    expect(within(page).queryByRole('link', { name: 'Join free' })).not.toBeInTheDocument();
    expect(page.querySelector('.footer__bottom')).toHaveTextContent('© 2026 Healthmarg');
    await expectKept(page, heading);
    expect(problems).toEqual([]);
  });

  it('switches Ritucharya to the season and language in the address after hydrating', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(BUILT);
    const { page, heading } = await hydrate('/ritucharya?ritu=varsha&lang=hi');
    await waitFor(() => {
      expect(within(page).getByRole('tab', { selected: true })).toHaveAttribute('id', 'tab-varsha');
    });
    expect(within(page).getByRole('button', { name: 'हिन्दी' })).toHaveAttribute('aria-pressed', 'true');
    await expectKept(page, heading);
    expect(problems).toEqual([]);
  });

  it('starts empty when a host answers another address with a prerendered file (its fallback)', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(BUILT);
    const markup = await renderPage('/', BUILT);
    window.history.replaceState(null, '', '/signin');
    document.documentElement.classList.add('hm-shell'); // what theme-init.js does before paint
    container = document.createElement('div');
    container.id = 'root';
    container.dataset['prerendered'] = '/';
    container.innerHTML = markup;
    document.body.append(container);
    const target = container;
    await act(async () => {
      root = await startApp(target);
    });
    expect(await within(target).findByRole('heading', { name: 'Welcome back' })).toBeInTheDocument();
    expect(within(target).queryByText('Ancient wisdom for')).not.toBeInTheDocument();
    expect(document.documentElement).not.toHaveClass('hm-shell');
    expect(target.dataset['prerendered']).toBeUndefined();
    expect(problems).toEqual([]);
  });

  it('makes every page complete and in order: no inline style or script, no unfinished section (the CSP)', async () => {
    for (const path of PRERENDER_PATHS) {
      const html = await renderPage(path, BUILT);
      expect(html, path).toContain('<main id="main"');
      expect(html, path).not.toContain('page-loader'); // the spinner shown while a page's code loads
      expect(inlineStyles(html), path).toEqual([]);
      expect(unfinishedParts(html), path).toEqual([]);
    }
  });
});
