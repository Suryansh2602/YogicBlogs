import { beforeAll, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { mockApi, session } from '../helpers/api';
import { preloadPages, rememberSignedIn, renderApp, siteHeader } from '../helpers/render';

beforeAll(preloadPages, 60_000);

describe('app routing', () => {
  it('renders the home page inside the layout; a new visitor triggers no sign-in check, only the public article list', async () => {
    const api = mockApi({ 'GET /articles': { body: { items: [], nextCursor: null } } });
    renderApp('/');
    expect(screen.getByRole('heading', { level: 1, name: /Ancient wisdom for/ })).toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: 'Main' })).toBeInTheDocument();
    expect(await within(siteHeader()).findByRole('link', { name: 'Join free' })).toBeInTheDocument();
    await waitFor(() => {
      expect(api.calls.length).toBeGreaterThan(0);
    });
    // StrictMode starts effects twice in tests (the first request is cancelled); a real browser asks once.
    expect(new Set(api.calls.map((c) => `${c.method} ${c.path}`))).toEqual(new Set(['GET /articles?limit=4']));
  });

  it('shows the not-found page for unknown paths and links home', async () => {
    mockApi({});
    const router = renderApp('/no-such-page');
    expect(screen.getByRole('heading', { name: 'Page not found' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('link', { name: 'Go back home' }));
    expect(router.state.location.pathname).toBe('/');
  });

  it('sends signed-out visitors from the dashboard to sign in', async () => {
    mockApi({});
    const router = renderApp('/dashboard');
    expect(await screen.findByRole('heading', { name: 'Welcome back' })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/signin');
  });

  it('restores a session on load and sends a signed-in member from sign-in to the dashboard', async () => {
    rememberSignedIn();
    mockApi({ 'GET /auth/csrf': { body: { csrfToken: 'c' } }, 'POST /auth/refresh': session() });
    const router = renderApp('/signin');
    expect(await screen.findByRole('heading', { name: /Welcome, Meera/ })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/dashboard');
  });

  it('keeps "was signed in" through a network failure, so the next load restores the session', async () => {
    rememberSignedIn();
    vi.stubGlobal('fetch', vi.fn<typeof fetch>().mockRejectedValue(new TypeError('Failed to fetch')));
    renderApp('/');
    expect(await screen.findByRole('link', { name: 'Join free' })).toBeInTheDocument();
    expect(localStorage.getItem('hm-signed-in')).toBe('1');
  });

  it('forgets the session only when the server says it is no longer valid', async () => {
    rememberSignedIn();
    mockApi({ 'GET /auth/csrf': { body: { csrfToken: 'c' } }, 'POST /auth/refresh': { status: 401, body: { error: { message: 'Please sign in', code: 'NO_SESSION' } } } });
    renderApp('/');
    expect(await screen.findByRole('link', { name: 'Join free' })).toBeInTheDocument();
    await waitFor(() => {
      expect(localStorage.getItem('hm-signed-in')).toBeNull();
    });
  });

  it('shows the legal placeholders', async () => {
    mockApi({});
    renderApp('/privacy');
    expect(await screen.findByRole('heading', { name: 'Privacy Policy' })).toBeInTheDocument();
  });
});
