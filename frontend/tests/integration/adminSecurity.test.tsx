// Admin → Security: see where the setup code comes from, change it (password + 2FA code, or a generated
// one), go back to the .env code, and every error is specific.
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { apiError, makeUser, mockApi, session } from '../helpers/api';
import { preloadPages, rememberSignedIn, renderApp } from '../helpers/render';
import { generateSetupCode } from '../../src/pages/admin/AdminSecurity';

beforeAll(preloadPages, 60_000);

const admin = makeUser({ id: '0190a1b2-c3d4-7000-8000-0000000000aa', displayName: 'Guru Admin', role: 'admin', twoFactorEnabled: true });
const restore = { 'GET /auth/csrf': { body: { csrfToken: 'c' } }, 'POST /auth/refresh': session(admin) };
const fromEnv = { body: { setupCode: { source: 'env', changedAt: null, changedBy: null }, failedCodeAttempts24h: 0 } };
const fromPanel = { body: { setupCode: { source: 'panel', changedAt: '2026-10-30T06:00:00Z', changedBy: 'Guru Admin' }, failedCodeAttempts24h: 2 } };
const NEW_CODE = 'panel-setup-code-0123456789-abcdefgh';

async function fillProof() {
  await userEvent.type(await screen.findByLabelText('Your password'), 'Banyan-roots-run-deep-42');
  await userEvent.type(screen.getByLabelText('Code from your authenticator app'), '123456');
}

describe('admin security page', () => {
  it('is in the admin menu and shows where the code comes from', async () => {
    rememberSignedIn();
    mockApi({ ...restore, 'GET /admin/security': fromEnv });
    renderApp('/admin/security');
    expect(await screen.findByText('ADMIN_SETUP_CODE from the server’s backend/.env (the fallback).')).toBeInTheDocument();
    expect(within(screen.getByRole('navigation', { name: 'Admin' })).getByRole('link', { name: /Security/ })).toHaveAttribute('href', '/admin/security');
    expect(screen.queryByRole('button', { name: 'Use the .env code instead' })).toBeNull(); // nothing to remove yet
  });

  it('checks every field before sending, with a specific message for each', async () => {
    rememberSignedIn();
    const api = mockApi({ ...restore, 'GET /admin/security': fromEnv });
    renderApp('/admin/security');
    await userEvent.click(await screen.findByRole('button', { name: 'Change setup code' }));
    expect(screen.getByText('Enter your password.')).toBeInTheDocument();
    expect(screen.getByText('Enter the 6-digit code from your authenticator app.')).toBeInTheDocument();
    expect(screen.getByText('Use at least 24 characters (Generate makes a strong one).')).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText('New setup code'), NEW_CODE);
    await userEvent.type(screen.getByLabelText('New setup code again'), `${NEW_CODE}x`);
    await userEvent.click(screen.getByRole('button', { name: 'Change setup code' }));
    expect(screen.getByText('The two codes don’t match.')).toBeInTheDocument();
    expect(api.callsTo('PUT /admin/security/setup-code')).toHaveLength(0);
  });

  it('generates a strong code, copies it, and changes the setup code', async () => {
    rememberSignedIn();
    let changed = false;
    const writeText = vi.fn(() => Promise.resolve());
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    const api = mockApi({
      ...restore,
      'GET /admin/security': () => (changed ? fromPanel : fromEnv),
      'PUT /admin/security/setup-code': () => {
        changed = true;
        return { body: { setupCode: fromPanel.body.setupCode } };
      },
    });
    renderApp('/admin/security');
    await fillProof();
    await userEvent.click(screen.getByRole('button', { name: 'Generate a strong code' }));
    const generated = screen.getByLabelText<HTMLInputElement>('New setup code').value;
    expect(generated).toMatch(/^[A-Za-z0-9_-]{32}$/);
    expect(screen.getByText(/Save this code in your password manager now/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Copy the code' }));
    expect(writeText).toHaveBeenCalledWith(generated);
    await userEvent.click(screen.getByRole('button', { name: 'Change setup code' }));
    expect(await screen.findByText(/Setup code changed\. It works from now on/)).toBeInTheDocument();
    expect(api.callsTo('PUT /admin/security/setup-code')[0]?.body).toEqual({ password: 'Banyan-roots-run-deep-42', totpCode: '123456', newCode: generated });
    expect(await screen.findByText('Set here, in the Admin panel.')).toBeInTheDocument();
    expect(screen.getByText(/by Guru Admin/)).toBeInTheDocument();
    expect(screen.getByText(/see the Audit log/)).toBeInTheDocument(); // 2 wrong codes tried
  });

  it.each([
    [apiError(403, 'PASSWORD_INCORRECT', 'Your password is not correct.'), 'Your password is not correct.'],
    [apiError(403, 'TOTP_INVALID', 'The two-step sign-in code is not correct, or was already used. Enter the newest code from your app.'), /two-step sign-in code is not correct/],
  ])('says exactly what was wrong (%#)', async (reply, text) => {
    rememberSignedIn();
    mockApi({ ...restore, 'GET /admin/security': fromEnv, 'PUT /admin/security/setup-code': reply });
    renderApp('/admin/security');
    await fillProof();
    await userEvent.type(screen.getByLabelText('New setup code'), NEW_CODE);
    await userEvent.type(screen.getByLabelText('New setup code again'), NEW_CODE);
    await userEvent.click(screen.getByRole('button', { name: 'Change setup code' }));
    expect(await screen.findByText(text)).toBeInTheDocument();
  });

  it('goes back to the .env code, or says why it can’t', async () => {
    rememberSignedIn();
    // Answers follow what happened (test mode loads each page twice): the panel code until it is removed.
    let removed = false;
    let attempts = 0;
    const api = mockApi({
      ...restore,
      'GET /admin/security': () => (removed ? fromEnv : fromPanel),
      'DELETE /admin/security/setup-code': () => {
        attempts += 1;
        if (attempts === 1) return apiError(409, 'NO_FALLBACK', 'Set ADMIN_SETUP_CODE in backend/.env first: without a code, the admin account could not be recovered.');
        removed = true;
        return { body: { setupCode: fromEnv.body.setupCode } };
      },
    });
    renderApp('/admin/security');
    await fillProof();
    await userEvent.click(await screen.findByRole('button', { name: 'Use the .env code instead' }));
    expect(await screen.findByText(/Set ADMIN_SETUP_CODE in backend\/\.env first/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Use the .env code instead' }));
    expect(await screen.findByText(/ADMIN_SETUP_CODE from backend\/\.env counts again/)).toBeInTheDocument();
    expect(api.callsTo('DELETE /admin/security/setup-code')[1]?.body).toEqual({ password: 'Banyan-roots-run-deep-42', totpCode: '123456' });
  });
});

describe('generated setup codes', () => {
  it('are 32 characters of letters, digits, - and _, and never repeat', () => {
    const codes = new Set(Array.from({ length: 200 }, generateSetupCode));
    expect(codes.size).toBe(200);
    for (const code of codes) expect(code).toMatch(/^[A-Za-z0-9_-]{32}$/);
  });
});
