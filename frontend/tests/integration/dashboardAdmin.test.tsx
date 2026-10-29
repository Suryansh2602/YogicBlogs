import { beforeAll, describe, expect, it } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { apiError, makeUser, mockApi, session } from '../helpers/api';
import { preloadPages, rememberSignedIn, renderApp, siteHeader } from '../helpers/render';

const restore = (user = makeUser()) => ({ 'GET /auth/csrf': { body: { csrfToken: 'c' } }, 'POST /auth/refresh': session(user) });
const admin = makeUser({ id: '0190a1b2-c3d4-7000-8000-0000000000aa', email: 'guru@example.com', displayName: 'Guru Admin', role: 'admin', twoFactorEnabled: true });
const enrolment = { body: { otpauthUrl: 'otpauth://totp/x', qrDataUrl: 'data:image/png;base64,AAAA', secret: 'JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP' } };
const codes = ['AAAAA-11111', 'BBBBB-22222', 'CCCCC-33333', 'DDDDD-44444', 'EEEEE-55555', 'FFFFF-66666', 'GGGGG-77777', 'HHHHH-88888', 'IIIII-99999', 'JJJJJ-00000'];

beforeAll(preloadPages, 60_000);

describe('member dashboard', () => {
  it('edits the display name', async () => {
    rememberSignedIn();
    const api = mockApi({ ...restore(), 'PATCH /users/me': { body: { user: makeUser({ displayName: 'Meera Krishnan' }) } } });
    renderApp('/dashboard');
    await userEvent.click(await screen.findByRole('button', { name: 'Edit name' }));
    const input = screen.getByLabelText('Name');
    await userEvent.clear(input);
    await userEvent.type(input, 'Meera Krishnan');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByText('Meera Krishnan')).toBeInTheDocument();
    expect(api.callsTo('PATCH /users/me')[0]?.headers['Authorization']).toMatch(/^Bearer token-for-/);
  });

  it('turns on two-step sign-in and hands over the backup codes', async () => {
    rememberSignedIn();
    const api = mockApi({
      ...restore(),
      'POST /auth/2fa/setup': enrolment,
      'POST /auth/2fa/enable': { body: { backupCodes: codes } },
    });
    renderApp('/dashboard');
    await userEvent.click(await screen.findByRole('button', { name: 'Turn on' }));
    expect(await screen.findByRole('img', { name: 'QR code for your authenticator app' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Can’t scan the code?' }));
    expect(screen.getByText('JBSW Y3DP EHPK 3PXP JBSW Y3DP EHPK 3PXP')).toBeInTheDocument();
    await userEvent.click(screen.getByLabelText('Digit 1 of 6'));
    await userEvent.keyboard('123456');
    expect(await screen.findByText('Your account is protected')).toBeInTheDocument();
    expect(screen.getAllByRole('listitem').filter((li) => /-\d{5}$/.test(li.textContent))).toHaveLength(10);
    const proceed = screen.getByRole('button', { name: 'Continue' });
    expect(proceed).toBeDisabled();
    await userEvent.click(screen.getByRole('checkbox'));
    await userEvent.click(proceed);
    expect(await screen.findByText(/On\. Signing in needs your password/)).toBeInTheDocument();
    // Exactly one setup: a second one would replace the secret behind the QR code on screen.
    expect(api.callsTo('POST /auth/2fa/setup')).toHaveLength(1);
  });

  it('says what is wrong with an empty name, and clears it on typing', async () => {
    rememberSignedIn();
    const api = mockApi(restore());
    renderApp('/dashboard');
    await userEvent.click(await screen.findByRole('button', { name: 'Edit name' }));
    await userEvent.clear(screen.getByLabelText('Name'));
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(screen.getByText('Enter your name, so we know what to call you.')).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText('Name'), 'M');
    expect(screen.queryByText(/Enter your name/)).not.toBeInTheDocument();
    expect(api.callsTo('PATCH /users/me')).toHaveLength(0);
  });

  it('signs out everywhere', async () => {
    rememberSignedIn();
    const api = mockApi({ ...restore(), 'POST /auth/logout-all': { status: 204 } });
    const router = renderApp('/dashboard');
    await userEvent.click(await screen.findByRole('button', { name: 'Sign out everywhere' }));
    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/signin');
    });
    expect(api.callsTo('POST /auth/logout-all')).toHaveLength(1);
  });

  it('signs out from the header', async () => {
    rememberSignedIn();
    mockApi({ ...restore(), 'POST /auth/logout': { status: 204 } });
    const router = renderApp('/dashboard');
    await userEvent.click(await screen.findByRole('button', { name: 'Sign out' }));
    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/');
    });
    expect(await within(siteHeader()).findByRole('link', { name: 'Join free' })).toBeInTheDocument();
  });
});

describe('admin', () => {
  it('shows members the admin sign-in at /admin, never the panel', async () => {
    rememberSignedIn();
    mockApi({ ...restore(), 'GET /admin/setup/status': { body: { setupRequired: false } } });
    renderApp('/admin');
    expect(await screen.findByRole('heading', { name: 'Admin sign-in' })).toBeInTheDocument();
    expect(screen.getByText(/You’re signed in as a member/)).toBeInTheDocument();
  });

  it('points to setup while no admin exists', async () => {
    mockApi({ 'GET /admin/setup/status': { body: { setupRequired: true } } });
    renderApp('/admin');
    expect(await screen.findByRole('link', { name: 'Create the first admin account' })).toHaveAttribute('href', '/admin/setup');
  });

  it('creates the first admin with the setup code', async () => {
    const api = mockApi({
      'GET /admin/setup/status': { body: { setupRequired: true } },
      'POST /admin/setup': [apiError(403, 'SETUP_CODE_INVALID', 'The setup code is not correct'), { status: 201, body: { user: admin } }],
    });
    renderApp('/admin/setup');
    await userEvent.type(await screen.findByLabelText('Setup code'), 'wrong-code-wrong-code');
    await userEvent.type(screen.getByLabelText('Your name'), 'Guru Admin');
    await userEvent.type(screen.getByLabelText('Admin email'), 'guru@example.com');
    await userEvent.type(screen.getByLabelText('Password'), 'Banyan-shade-and-still-water');
    await userEvent.click(screen.getByRole('button', { name: 'Create admin account' }));
    expect(await screen.findByText('The setup code is not correct')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Create admin account' }));
    expect(await screen.findByRole('heading', { name: 'Admin account created' })).toBeInTheDocument();
    expect(api.callsTo('POST /admin/setup')).toHaveLength(2);
  });

  it('says so when setup is already complete', async () => {
    mockApi({ 'GET /admin/setup/status': { body: { setupRequired: false } } });
    renderApp('/admin/setup');
    expect(await screen.findByText('Setup is already complete.')).toBeInTheDocument();
  });

  it('first sign-in: enrol 2FA, save backup codes, then the panel opens', async () => {
    mockApi({
      'GET /admin/setup/status': { body: { setupRequired: false } },
      'POST /auth/admin/login': { body: { mfaSetupRequired: true, mfaTicket: 'ticket-admin-1234567890' } },
      'POST /auth/login/2fa/setup': enrolment,
      'POST /auth/login/2fa/enable': { body: { accessToken: 'admin-token', user: admin, backupCodes: codes } },
      'GET /admin/stats': { body: { users: 12, admins: 1, verified: 10, suspended: 0, newThisWeek: 4, activeThisWeek: 7 } },
    });
    renderApp('/admin');
    await userEvent.type(await screen.findByLabelText('Admin email'), 'guru@example.com');
    await userEvent.type(screen.getByLabelText('Password'), 'Banyan-shade-and-still-water');
    await userEvent.click(screen.getByRole('button', { name: 'Continue' }));
    expect(await screen.findByRole('heading', { name: 'Secure your admin account' })).toBeInTheDocument();
    await screen.findByRole('img', { name: 'QR code for your authenticator app' });
    await userEvent.click(screen.getByLabelText('Digit 1 of 6'));
    await userEvent.keyboard('123456');
    await screen.findByText('Your account is protected');
    // The panel must not replace the backup codes before they're saved.
    expect(screen.queryByRole('heading', { name: 'Guru Admin' })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('checkbox'));
    await userEvent.click(screen.getByRole('button', { name: 'Continue' }));
    expect(await screen.findByRole('heading', { name: 'Guru Admin' })).toBeInTheDocument();
    expect(await screen.findByText('12')).toBeInTheDocument();
  });

  it('returning admin: code step, then members and audit log', async () => {
    const api = mockApi({
      'GET /admin/setup/status': { body: { setupRequired: false } },
      'POST /auth/admin/login': { body: { mfaRequired: true, mfaTicket: 'ticket-admin-1234567890' } },
      'POST /auth/login/2fa': { body: { accessToken: 'admin-token', user: admin } },
      'GET /admin/stats': { body: { users: 2, admins: 1, verified: 2, suspended: 0, newThisWeek: 2, activeThisWeek: 2 } },
      'GET /admin/users': {
        body: {
          items: [
            { id: 'u1', email: 'meera@example.com', displayName: 'Meera Iyer', role: 'user', status: 'active', emailVerified: true, lastLoginAt: null, createdAt: '2026-10-01T10:00:00Z' },
            { id: 'u2', email: 'ravi@example.com', displayName: 'Ravi', role: 'user', status: 'suspended', emailVerified: true, lastLoginAt: null, createdAt: '2026-10-02T10:00:00Z' },
          ],
          page: 1,
          pageSize: 20,
          total: 2,
        },
      },
      'GET /admin/audit-logs': {
        body: {
          items: [
            { id: 2, action: 'auth.login.failure', actorId: null, actorEmail: null, entityType: null, entityId: null, ip: '203.0.113.9', createdAt: '2026-10-25T10:00:00Z' },
            { id: 1, action: 'admin.setup.created', actorId: admin.id, actorEmail: 'guru@example.com', entityType: 'user', entityId: admin.id, ip: '::1', createdAt: '2026-10-25T09:00:00Z' },
          ],
          page: 1,
          pageSize: 25,
          total: 2,
        },
      },
    });
    const router = renderApp('/admin/users');
    await userEvent.type(await screen.findByLabelText('Admin email'), 'guru@example.com');
    await userEvent.type(screen.getByLabelText('Password'), 'Banyan-shade-and-still-water');
    await userEvent.click(screen.getByRole('button', { name: 'Continue' }));
    await userEvent.click(await screen.findByLabelText('Digit 1 of 6'));
    await userEvent.keyboard('654321');

    const table = await screen.findByRole('table');
    expect(await within(table).findByText('meera@example.com')).toBeInTheDocument();
    expect(within(table).getByText('Suspended')).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText('Search by name or email'), 'ravi');
    await waitFor(() => {
      expect(api.callsTo('GET /admin/users').some((c) => c.path.includes('search=ravi'))).toBe(true);
    });

    await userEvent.click(screen.getByRole('link', { name: /Audit log/ }));
    expect(await screen.findByText('admin.setup.created')).toBeInTheDocument();
    expect(screen.getByText('guru@example.com')).toBeInTheDocument();
    expect(screen.getByText('Not signed in')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Sign-ins' }));
    await waitFor(() => {
      expect(api.callsTo('GET /admin/audit-logs').some((c) => c.path.includes('action=auth.login'))).toBe(true);
    });
    expect(router.state.location.pathname).toBe('/admin/audit');
  });

  it('shows an error if the panel data can’t load', async () => {
    rememberSignedIn();
    mockApi({ ...restore(admin), 'GET /admin/stats': { status: 500, body: { error: { message: 'Internal server error' } } } });
    renderApp('/admin');
    expect(await screen.findByText(/Our server had a problem/)).toBeInTheDocument();
  });
});
