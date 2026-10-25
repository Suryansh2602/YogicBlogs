// With email features switched off (the current setting), sign-up signs people in straight away and no
// email pages or links exist.
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { makeUser, mockApi } from '../helpers/api';
import { preloadPages, renderApp } from '../helpers/render';

beforeAll(preloadPages, 60_000);

beforeEach(() => {
  vi.stubEnv('VITE_FEATURE_EMAIL', 'false');
});

afterEach(() => {
  vi.unstubAllEnvs();
});

const signUp = async () => {
  await userEvent.type(await screen.findByLabelText('Your name'), 'Kavya Rao');
  await userEvent.type(screen.getByLabelText('Email'), 'kavya@example.com');
  await userEvent.type(screen.getByLabelText('Password'), 'Neem-and-tulsi-at-dawn-7');
  await userEvent.click(screen.getByRole('checkbox'));
  await userEvent.click(screen.getByRole('button', { name: 'Create my account' }));
};

describe('email switched off', () => {
  it('signs a new member straight in after sign-up, with no "confirm your email" step', async () => {
    const user = makeUser({ email: 'kavya@example.com', displayName: 'Kavya Rao', emailVerified: false });
    mockApi({ 'POST /auth/register': { status: 201, body: { accessToken: 'new-token', user } } });
    const router = renderApp('/signup');
    await signUp();
    expect(await screen.findByRole('heading', { name: /Welcome, Kavya/ })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/dashboard');
    expect(screen.queryByText('Confirm your email')).not.toBeInTheDocument();
  });

  it('shows "already exists" under the email field', async () => {
    const message = 'An account with this email already exists. Sign in instead, or use a different email.';
    mockApi({ 'POST /auth/register': { status: 409, body: { error: { message, code: 'EMAIL_TAKEN', details: [{ path: 'email', message }] } } } });
    renderApp('/signup');
    await signUp();
    expect(await screen.findAllByText(message)).toHaveLength(1);
    await userEvent.type(screen.getByLabelText('Email'), 'x');
    expect(screen.queryByText(message)).not.toBeInTheDocument();
  });

  it('hides "Forgot password?" on sign-in', async () => {
    mockApi({});
    renderApp('/signin');
    expect(await screen.findByRole('heading', { name: 'Welcome back' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Forgot password?' })).not.toBeInTheDocument();
  });

  it('does not suggest a password reset in the lockout message', async () => {
    mockApi({ 'POST /auth/login': { status: 429, headers: { 'Retry-After': '900' }, body: { error: { message: 'locked', code: 'LOGIN_LOCKED' } } } });
    renderApp('/signin');
    await userEvent.type(await screen.findByLabelText('Email'), 'kavya@example.com');
    await userEvent.type(screen.getByLabelText('Password'), 'wrong-password-123');
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(
      await screen.findByText('Too many wrong passwords for this account, so sign-in is paused for your safety. Try again in about 15 minutes.'),
    ).toBeInTheDocument();
  });

  it('shows members as Active in the admin panel, without email-confirmation labels or stats', async () => {
    localStorage.setItem('hm-signed-in', '1');
    const admin = makeUser({ email: 'guru@example.com', displayName: 'Guru Admin', role: 'admin', twoFactorEnabled: true });
    mockApi({
      'GET /auth/csrf': { body: { csrfToken: 'c' } },
      'POST /auth/refresh': { body: { accessToken: 't', user: admin } },
      'GET /admin/stats': { body: { users: 3, admins: 1, verified: 1, suspended: 0, newThisWeek: 3, activeThisWeek: 2 } },
      'GET /admin/users': {
        body: {
          items: [{ id: 'u1', email: 'kavya@example.com', displayName: 'Kavya Rao', role: 'user', status: 'active', emailVerified: false, lastLoginAt: null, createdAt: '2026-10-25T10:00:00Z' }],
          page: 1,
          pageSize: 20,
          total: 1,
        },
      },
    });
    renderApp('/admin');
    expect(await screen.findByText('Members')).toBeInTheDocument();
    expect(screen.queryByText('Confirmed their email')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('link', { name: /Members/ }));
    expect(await screen.findByText('kavya@example.com')).toBeInTheDocument();
    expect(screen.getByText('Active')).toBeInTheDocument();
    expect(screen.queryByText('Email not confirmed')).not.toBeInTheDocument();
    expect(screen.queryByText('Unverified')).not.toBeInTheDocument();
  });

  it.each(['/forgot-password', '/reset-password?token=tok_reset_1234567890abcdef', '/verify-email?token=tok_verify_1234567890abcdef', '/check-email'])(
    'has no %s page and makes no API call',
    async (path) => {
      const api = mockApi({});
      renderApp(path);
      expect(await screen.findByRole('heading', { name: 'Page not found' })).toBeInTheDocument();
      expect(api.calls).toHaveLength(0);
    },
  );
});
