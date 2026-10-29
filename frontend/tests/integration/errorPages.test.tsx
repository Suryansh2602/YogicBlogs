// Error pages: not found (with search and links), a page that crashes, page code missing after an update,
// no connection, the site frame itself failing, and an article that can't be found or can't load.
import { StrictMode } from 'react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider, type RouteObject } from 'react-router';
import Layout from '../../src/components/layout/Layout';
import RouteError from '../../src/pages/RouteError';
import { ThemeProvider } from '../../src/theme/ThemeProvider';
import { AuthProvider } from '../../src/features/auth/AuthProvider';
import { apiError, mockApi } from '../helpers/api';
import { preloadPages, renderApp, siteHeader } from '../helpers/render';

beforeAll(preloadPages, 60_000);

const setOnline = (online: boolean) => {
  Object.defineProperty(navigator, 'onLine', { value: online, configurable: true });
};
afterEach(() => {
  setOnline(true);
});

function Boom({ message }: { message: string }): never {
  throw new Error(message);
}

/** The real site frame and error screens around a page that throws. */
function renderBroken(message: string, { frameFails = false } = {}) {
  const routes: RouteObject[] = frameFails
    ? [{ path: '/', element: <Boom message={message} />, errorElement: <RouteError standalone /> }]
    : [
        {
          path: '/',
          element: <Layout />,
          errorElement: <RouteError standalone />,
          children: [{ errorElement: <RouteError />, children: [{ index: true, element: <Boom message={message} /> }] }],
        },
      ];
  const router = createMemoryRouter(routes);
  render(
    <StrictMode>
      <ThemeProvider>
        <AuthProvider>
          <RouterProvider router={router} />
        </AuthProvider>
      </ThemeProvider>
    </StrictMode>,
  );
  return router;
}

// React reports errors caught by error screens on the console; that's expected here.
const quiet = () => vi.spyOn(console, 'error').mockImplementation(() => undefined);

describe('page not found', () => {
  it('says so plainly and helps: home, search the articles, and links to the sections', async () => {
    mockApi({ 'GET /articles': { body: { items: [], nextCursor: null } }, 'GET /conditions': { body: { items: [] } } });
    const router = renderApp('/no-such-page');
    expect(screen.getByRole('heading', { level: 1, name: 'Page not found' })).toBeInTheDocument();
    expect(screen.getByText('404')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Go back home' })).toHaveAttribute('href', '/');
    const helpful = screen.getByRole('navigation', { name: 'Helpful links' });
    expect(within(helpful).getByRole('link', { name: /Ritucharya/ })).toHaveAttribute('href', '/ritucharya');
    await userEvent.type(screen.getByLabelText('Search the articles'), 'sleep');
    await userEvent.click(within(screen.getByRole('search')).getByRole('button', { name: 'Search' }));
    await waitFor(() => {
      expect(`${router.state.location.pathname}${router.state.location.search}`).toBe('/articles?q=sleep');
    });
  });
});

describe('error page search is safe', () => {
  it('sends whatever is typed only as a search on the articles page, never as another address', async () => {
    mockApi({ 'GET /articles': { body: { items: [], nextCursor: null } }, 'GET /conditions': { body: { items: [] } } });
    const router = renderApp('/no-such-page');
    const hostile = '../admin?x=<script>alert(1)</script>&q=2#top';
    await userEvent.type(screen.getByLabelText('Search the articles'), hostile);
    await userEvent.click(within(screen.getByRole('search')).getByRole('button', { name: 'Search' }));
    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/articles');
    });
    expect(new URLSearchParams(router.state.location.search).get('q')).toBe(hostile);
    expect(router.state.location.hash).toBe('');
    expect(document.querySelector('script')).toBeNull();
  });
});

describe('a page that fails', () => {
  it('shows "Something went wrong" inside the site frame, with no technical details', async () => {
    const spy = quiet();
    mockApi({});
    renderBroken('Cannot read properties of undefined (reading "title")');
    expect(await screen.findByRole('heading', { level: 1, name: 'Something went wrong' })).toBeInTheDocument();
    expect(screen.getByText(/It isn’t anything you did/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Go home' })).toHaveAttribute('href', '/');
    expect(screen.queryByText(/Cannot read properties/)).toBeNull(); // never shown to readers
    expect(within(siteHeader()).getByRole('link', { name: 'Articles' })).toBeInTheDocument(); // the frame stays
    expect(screen.getByRole('contentinfo')).toBeInTheDocument();
    spy.mockRestore();
  });

  it('asks for one reload when the page’s code is gone after an update', async () => {
    const spy = quiet();
    mockApi({});
    renderBroken('Failed to fetch dynamically imported module: http://localhost/assets/RitucharyaPage-old.js');
    expect(await screen.findByRole('heading', { level: 1, name: 'Healthmarg has been updated' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reload the page' })).toBeInTheDocument();
    spy.mockRestore();
  });

  it('says "You’re offline" when the connection is gone', async () => {
    const spy = quiet();
    setOnline(false);
    mockApi({});
    renderBroken('Failed to fetch dynamically imported module: http://localhost/assets/x.js');
    expect(await screen.findByRole('heading', { level: 1, name: 'You’re offline' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
    spy.mockRestore();
  });

  it('when the site frame itself fails, still shows the logo, a way home and the explanation', async () => {
    const spy = quiet();
    mockApi({});
    renderBroken('frame broke', { frameFails: true });
    expect(await screen.findByRole('heading', { level: 1, name: 'Something went wrong' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Healthmarg home' })).toHaveAttribute('href', '/');
    expect(screen.getByRole('main')).toBeInTheDocument();
    spy.mockRestore();
  });
});

describe('offline notice', () => {
  it('appears under the header while the browser is offline, and goes away when it is back', () => {
    mockApi({ 'GET /articles': { body: { items: [], nextCursor: null } } });
    renderApp('/');
    expect(screen.queryByText(/You’re offline\./)).toBeNull();
    act(() => {
      setOnline(false);
      window.dispatchEvent(new Event('offline'));
    });
    expect(screen.getByRole('status', { name: '' })).toHaveTextContent(/You’re offline\. Pages you already opened still work/);
    act(() => {
      setOnline(true);
      window.dispatchEvent(new Event('online'));
    });
    expect(screen.queryByText(/You’re offline\./)).toBeNull();
  });
});

describe('article errors', () => {
  it('an article that doesn’t exist: 404, browse all articles, and search', async () => {
    mockApi({ 'GET /articles/nothing-here': apiError(404, 'NOT_FOUND', 'This article doesn’t exist or isn’t published.') });
    renderApp('/articles/nothing-here');
    expect(await screen.findByRole('heading', { level: 1, name: 'We couldn’t find that article' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Browse all articles' })).toHaveAttribute('href', '/articles');
    expect(screen.getByLabelText('Search the articles')).toBeInTheDocument();
  });

  it('an article that can’t load: says why, and Try again asks again', async () => {
    // The server is down until the reader presses Try again (test mode loads each page twice).
    let serverBack = false;
    const article = { slug: 'calm', title: 'Calm', summary: 'S', lang: 'en', accent: 'teal', accessLevel: 'public', condition: null, cover: null, coverFocus: { x: 50, y: 50 }, readingMinutes: 1, publishedAt: '2026-10-28T06:00:00Z', updatedAt: null, seo: { title: 'Calm', description: 'S' }, locked: false, body: { type: 'doc', content: [] }, images: {}, articles: {}, related: [] };
    const api = mockApi({
      'GET /articles/calm': () => (serverBack ? { body: { article } } : apiError(503, 'UNAVAILABLE', 'Down for a moment.')),
    });
    renderApp('/articles/calm');
    expect(await screen.findByRole('heading', { level: 1, name: 'This article couldn’t load' })).toBeInTheDocument();
    serverBack = true;
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByRole('heading', { level: 1, name: 'Calm' })).toBeInTheDocument();
    expect(api.callsTo('GET /articles/calm').length).toBeGreaterThanOrEqual(2);
  });
});
