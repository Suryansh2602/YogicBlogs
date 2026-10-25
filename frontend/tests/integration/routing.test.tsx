import { beforeAll, describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { mockApi, session } from '../helpers/api';
import { preloadPages, rememberSignedIn, renderApp } from '../helpers/render';

beforeAll(preloadPages, 60_000);

describe('app routing', () => {
  it('renders the home page inside the layout without calling the API for a new visitor', async () => {
    const api = mockApi({});
    renderApp('/');
    expect(screen.getByRole('heading', { level: 1, name: /Ancient wisdom for/ })).toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: 'Main' })).toBeInTheDocument();
    expect(await screen.findByRole('link', { name: 'Join free' })).toBeInTheDocument();
    expect(api.calls).toHaveLength(0);
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

  it('shows the legal placeholders', async () => {
    mockApi({});
    renderApp('/privacy');
    expect(await screen.findByRole('heading', { name: 'Privacy Policy' })).toBeInTheDocument();
  });
});
