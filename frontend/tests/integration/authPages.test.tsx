import { beforeAll, describe, expect, it } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { apiError, makeUser, mockApi, session } from '../helpers/api';
import { preloadPages, renderApp } from '../helpers/render';

const fill = async (label: string | RegExp, value: string) => {
  await userEvent.type(screen.getByLabelText(label), value);
};

beforeAll(preloadPages, 60_000);

describe('sign up', () => {
  it('checks the form before sending anything', async () => {
    const api = mockApi({});
    renderApp('/signup');
    await userEvent.click(await screen.findByRole('button', { name: 'Create my account' }));
    expect(screen.getByText('Tell us what to call you')).toBeInTheDocument();
    expect(screen.getByText('Enter a valid email address')).toBeInTheDocument();
    expect(screen.getByText('Use at least 12 characters')).toBeInTheDocument();
    expect(screen.getByText(/accept the Terms/)).toBeInTheDocument();
    expect(api.calls).toHaveLength(0);
  });

  it('creates the account and asks the user to check their email', async () => {
    const api = mockApi({ 'POST /auth/register': { status: 202, body: { message: 'ok' } } });
    const router = renderApp('/signup');
    await fill(await screen.findByLabelText('Your name').then(() => 'Your name'), 'Meera Iyer');
    await fill('Email', 'meera@example.com');
    await fill('Password', 'Turmeric-and-tulsi-2026');
    await userEvent.click(screen.getByRole('checkbox'));
    await userEvent.click(screen.getByRole('button', { name: 'Create my account' }));
    expect(await screen.findByRole('heading', { name: 'Check your email' })).toBeInTheDocument();
    expect(screen.getByText('meera@example.com')).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/check-email');
    expect(api.callsTo('POST /auth/register')[0]?.body).toEqual({
      email: 'meera@example.com',
      password: 'Turmeric-and-tulsi-2026',
      displayName: 'Meera Iyer',
      acceptTerms: true,
      acceptPrivacy: true,
    });
  });

  it('shows the server’s reasons next to the fields', async () => {
    mockApi({
      'POST /auth/register': {
        status: 400,
        body: { error: { message: 'This password has appeared in a data breach.', code: 'BREACHED_PASSWORD', details: [{ path: 'password', message: 'Found in known data breaches' }] } },
      },
    });
    renderApp('/signup');
    await fill(await screen.findByLabelText('Your name').then(() => 'Your name'), 'Meera');
    await fill('Email', 'meera@example.com');
    await fill('Password', 'password-password-1');
    await userEvent.click(screen.getByRole('checkbox'));
    await userEvent.click(screen.getByRole('button', { name: 'Create my account' }));
    expect(await screen.findByText('Found in known data breaches')).toBeInTheDocument();
    expect(screen.getByText(/appeared in a data breach/)).toBeInTheDocument();
  });
});

describe('sign in', () => {
  const signIn = async (email = 'meera@example.com', password = 'Turmeric-and-tulsi-2026') => {
    await fill(await screen.findByLabelText('Email').then(() => 'Email'), email);
    await fill('Password', password);
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));
  };

  it('signs a member in and opens the dashboard', async () => {
    mockApi({ 'POST /auth/login': session() });
    const router = renderApp('/signin');
    await signIn();
    expect(await screen.findByRole('heading', { name: /Welcome, Meera/ })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/dashboard');
  });

  it('returns to the page the member was trying to open, but never to another site', async () => {
    mockApi({ 'POST /auth/login': session() });
    const router = renderApp('/signin', { from: '//evil.example/steal' });
    await signIn();
    await screen.findByRole('heading', { name: /Welcome, Meera/ });
    expect(router.state.location.pathname).toBe('/dashboard');
  });

  it('asks for the authenticator code when 2FA is on', async () => {
    const api = mockApi({
      'POST /auth/login': { body: { mfaRequired: true, mfaTicket: 'ticket-123456789012345' } },
      'POST /auth/login/2fa': [apiError(401, 'INVALID_CODE', 'That code isn’t right. Please try again.'), session(makeUser({ twoFactorEnabled: true }))],
    });
    renderApp('/signin');
    await signIn();
    expect(await screen.findByRole('heading', { name: 'Two-step sign-in' })).toBeInTheDocument();
    await userEvent.click(screen.getByLabelText('Digit 1 of 6'));
    await userEvent.keyboard('000000');
    expect(await screen.findByText('That code isn’t right. Please try again.')).toBeInTheDocument();
    await userEvent.click(screen.getByLabelText('Digit 1 of 6'));
    await userEvent.keyboard('123456');
    expect(await screen.findByRole('heading', { name: /Welcome, Meera/ })).toBeInTheDocument();
    expect(api.callsTo('POST /auth/login/2fa').at(-1)?.body).toEqual({ mfaTicket: 'ticket-123456789012345', code: '123456' });
  });

  it('accepts a backup code instead, and restarts when the attempt has expired', async () => {
    mockApi({
      'POST /auth/login': { body: { mfaRequired: true, mfaTicket: 'ticket-123456789012345' } },
      'POST /auth/login/2fa': apiError(401, 'MFA_TICKET_INVALID'),
    });
    renderApp('/signin');
    await signIn();
    await userEvent.click(await screen.findByRole('button', { name: 'Lost your phone? Use a backup code' }));
    await fill('Backup code', 'ABCDE-12345');
    await userEvent.click(screen.getByRole('button', { name: 'Verify and continue' }));
    expect(await screen.findByText(/sign-in attempt has expired/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Sign in again' }));
    expect(screen.getByRole('heading', { name: 'Welcome back' })).toBeInTheDocument();
  });

  it('offers to resend the confirmation email to unverified members', async () => {
    const api = mockApi({
      'POST /auth/login': apiError(403, 'EMAIL_NOT_VERIFIED', 'Please confirm your email first. We can send the link again.'),
      'POST /auth/verify-email/resend': { status: 202, body: { message: 'ok' } },
    });
    renderApp('/signin');
    await signIn();
    await userEvent.click(await screen.findByRole('button', { name: 'Send the confirmation link again' }));
    expect(await screen.findByText('A new confirmation link is on its way.')).toBeInTheDocument();
    expect(api.callsTo('POST /auth/verify-email/resend')[0]?.body).toEqual({ email: 'meera@example.com' });
  });

  it('explains a lockout in plain words', async () => {
    mockApi({ 'POST /auth/login': apiError(429, 'LOGIN_LOCKED') });
    renderApp('/signin');
    await signIn();
    expect(await screen.findByText(/sign-in is paused for a little while/)).toBeInTheDocument();
  });
});

describe('emailed links', () => {
  it('confirms the email exactly once and removes the token from the address bar', async () => {
    const token = 'tok_verify_1234567890abcdef';
    const api = mockApi({ 'POST /auth/verify-email': { body: { message: 'ok' } } });
    renderApp(`/verify-email?token=${token}`);
    expect(await screen.findByRole('heading', { name: 'Email confirmed' })).toBeInTheDocument();
    expect(api.callsTo('POST /auth/verify-email')).toHaveLength(1);
    expect(api.callsTo('POST /auth/verify-email')[0]?.body).toEqual({ token });
    expect(window.location.search).not.toContain('token');
  });

  it('explains an expired confirmation link', async () => {
    mockApi({ 'POST /auth/verify-email': apiError(400, 'INVALID_TOKEN', 'This link is invalid or has expired. Please request a new one.') });
    renderApp('/verify-email?token=tok_expired_1234567890abcd');
    expect(await screen.findByText(/invalid or has expired/)).toBeInTheDocument();
  });

  it('rejects a malformed link without calling the API', async () => {
    const api = mockApi({});
    renderApp('/verify-email?token=<script>');
    expect(await screen.findByText(/link is incomplete/)).toBeInTheDocument();
    expect(api.calls).toHaveLength(0);
  });

  it('sends a reset link without revealing whether the account exists', async () => {
    mockApi({ 'POST /auth/password/forgot': { status: 202, body: { message: 'ok' } } });
    renderApp('/forgot-password');
    await fill(await screen.findByLabelText('Email').then(() => 'Email'), 'someone@example.com');
    await userEvent.click(screen.getByRole('button', { name: 'Send reset link' }));
    expect(await screen.findByText(/If an account exists for/)).toBeInTheDocument();
  });

  it('sets a new password from the reset link', async () => {
    const api = mockApi({ 'POST /auth/password/reset': { body: { message: 'ok' } } });
    renderApp('/reset-password?token=tok_reset_1234567890abcdef');
    await fill(await screen.findByLabelText('New password').then(() => 'New password'), 'Lotus-in-the-morning-sun');
    await fill('Repeat new password', 'Lotus-in-the-morning-sum');
    await userEvent.click(screen.getByRole('button', { name: 'Save new password' }));
    expect(await screen.findByText('The two passwords don’t match')).toBeInTheDocument();
    await userEvent.clear(screen.getByLabelText('Repeat new password'));
    await fill('Repeat new password', 'Lotus-in-the-morning-sun');
    await userEvent.click(screen.getByRole('button', { name: 'Save new password' }));
    expect(await screen.findByRole('heading', { name: 'Password changed' })).toBeInTheDocument();
    expect(api.callsTo('POST /auth/password/reset')[0]?.body).toEqual({ token: 'tok_reset_1234567890abcdef', password: 'Lotus-in-the-morning-sun' });
  });

  it('shows the check-email page with a resend cooldown', async () => {
    mockApi({});
    renderApp('/check-email', { email: 'meera@example.com' });
    expect(await screen.findByRole('button', { name: /Send again in \d+s/ })).toBeDisabled();
    await waitFor(() => {
      expect(screen.getByText('meera@example.com')).toBeInTheDocument();
    });
  });
});
