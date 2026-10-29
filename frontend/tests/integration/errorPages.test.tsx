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
import { ApiRequestError } from '../../src/services/apiClient';
import { AppErrorBoundary } from '../../src/components/AppErrorBoundary';
import { resetErrorReportsForTests } from '../../src/services/errorReporting';
import { preloadPages, renderApp, siteHeader } from '../helpers/render';

beforeAll(preloadPages, 60_000);

const setOnline = (online: boolean) => {
  Object.defineProperty(navigator, 'onLine', { value: online, configurable: true });
};
afterEach(() => {
  setOnline(true);
  resetErrorReportsForTests();
});

const REF = '0190a1b2-c3d4-7000-8000-00000000f00d';

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

  it('an article that fails on the server: “couldn’t load”, with the reference, and Try again asks again', async () => {
    // The server is down until the reader presses Try again (test mode loads each page twice).
    let serverBack = false;
    const article = { slug: 'calm', title: 'Calm', summary: 'S', lang: 'en', accent: 'teal', accessLevel: 'public', condition: null, cover: null, coverFocus: { x: 50, y: 50 }, readingMinutes: 1, publishedAt: '2026-10-28T06:00:00Z', updatedAt: null, seo: { title: 'Calm', description: 'S' }, locked: false, body: { type: 'doc', content: [] }, images: {}, articles: {}, related: [] };
    const api = mockApi({
      'GET /articles/calm': () =>
        serverBack ? { body: { article } } : { status: 500, body: { error: { message: 'Something went wrong on our side.', code: 'INTERNAL_ERROR', reference: REF } } },
    });
    renderApp('/articles/calm');
    expect(await screen.findByRole('heading', { level: 1, name: 'This article couldn’t load' })).toBeInTheDocument();
    expect(screen.getByText(REF)).toBeInTheDocument();
    serverBack = true;
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByRole('heading', { level: 1, name: 'Calm' })).toBeInTheDocument();
    expect(api.callsTo('GET /articles/calm').length).toBeGreaterThanOrEqual(2);
  });

  it('an article while the service is down: “temporarily unavailable”, with the reference', async () => {
    mockApi({ 'GET /articles/calm': { status: 503, headers: { 'Retry-After': '30' }, body: { error: { message: 'Healthmarg is temporarily unavailable.', code: 'SERVICE_UNAVAILABLE', reference: REF } } } });
    renderApp('/articles/calm');
    expect(await screen.findByRole('heading', { level: 1, name: 'Healthmarg is temporarily unavailable' })).toBeInTheDocument();
    expect(screen.getByText(REF)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
  });
});

describe('API errors passed to the error screen get their own page', () => {
  function Fails({ error }: { error: unknown }): never {
    throw error;
  }
  function renderThrowing(error: unknown) {
    const router = createMemoryRouter([
      { path: '/', element: <Layout />, errorElement: <RouteError standalone />, children: [{ errorElement: <RouteError />, children: [{ index: true, element: <Fails error={error} /> }] }] },
    ]);
    render(
      <ThemeProvider>
        <AuthProvider>
          <RouterProvider router={router} />
        </AuthProvider>
      </ThemeProvider>,
    );
  }

  it.each([
    [new ApiRequestError(401, 'Please sign in', 'UNAUTHORIZED'), 'Please sign in to continue', 'Sign in'],
    [new ApiRequestError(403, 'Admins only.', 'FORBIDDEN'), 'You don’t have access to this page', 'Go home'],
    [new ApiRequestError(404, 'Not found', 'NOT_FOUND'), 'Page not found', 'Go back home'],
    [new ApiRequestError(429, 'Too many requests', 'RATE_LIMITED', undefined, 90), 'Too many requests', 'Try again'],
    [new ApiRequestError(503, 'Unavailable', 'SERVICE_UNAVAILABLE', undefined, 30, REF), 'Healthmarg is temporarily unavailable', 'Try again'],
    [new ApiRequestError(500, 'Server error', 'INTERNAL_ERROR', undefined, undefined, REF), 'Something went wrong', 'Try again'],
  ])('%s → “%s”', async (error, title, action) => {
    const spy = quiet();
    mockApi({});
    renderThrowing(error);
    expect(await screen.findByRole('heading', { level: 1, name: title })).toBeInTheDocument();
    expect(screen.getAllByRole(action === 'Try again' ? 'button' : 'link', { name: action }).length).toBeGreaterThan(0);
    spy.mockRestore();
  });

  it('says how long to wait when rate limited, and shows the reference of server errors', async () => {
    const spy = quiet();
    mockApi({});
    renderThrowing(new ApiRequestError(429, 'Too many requests', 'RATE_LIMITED', undefined, 90));
    expect(await screen.findByText(/Please wait 2 minutes and try again/)).toBeInTheDocument();
    spy.mockRestore();
  });

  it('shows the API’s own reason when access is refused', async () => {
    const spy = quiet();
    mockApi({});
    renderThrowing(new ApiRequestError(403, 'Only admins with two-step sign-in can open this.', 'MFA_REQUIRED'));
    expect(await screen.findByText('Only admins with two-step sign-in can open this.')).toBeInTheDocument();
    spy.mockRestore();
  });
});

describe('app-wide safety net', () => {
  it('if even the providers fail, shows a calm page with Reload and Go home, and reports it', async () => {
    const spy = quiet();
    window.history.replaceState(null, '', '/dashboard?token=secret#x');
    const api = mockApi({ 'POST /client-errors': { status: 204 } });
    function Broken(): never {
      throw new Error('theme storage exploded');
    }
    render(
      <AppErrorBoundary>
        <Broken />
      </AppErrorBoundary>,
    );
    expect(screen.getByRole('heading', { level: 1, name: 'Something went wrong' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reload' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Go home' })).toHaveAttribute('href', '/');
    expect(screen.queryByText(/theme storage exploded/)).toBeNull();
    await waitFor(() => {
      expect(api.callsTo('POST /client-errors')).toHaveLength(1);
    });
    expect(api.callsTo('POST /client-errors')[0]?.body).toMatchObject({ kind: 'crash', message: 'Error: theme storage exploded', path: '/dashboard' }); // path only: no query or fragment
    spy.mockRestore();
  });
});
