// Admin recovery page: the setup code finds the admin accounts (with their emails), then a new password
// recovers one. Every error is specific, and the sign-in page links here.
import { beforeAll, describe, expect, it } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { apiError, mockApi } from '../helpers/api';
import { preloadPages, renderApp } from '../helpers/render';

beforeAll(preloadPages, 60_000);

const ADMIN = { id: '0190a1b2-c3d4-7000-8000-00000000000a', email: 'owner-admin@example.com', displayName: 'Owner' };
const CODE = 'test-only-admin-setup-code';

describe('admin recovery', () => {
  it('is linked from the admin sign-in page', async () => {
    mockApi({ 'GET /admin/setup/status': { body: { setupRequired: false } } });
    renderApp('/admin');
    expect(await screen.findByRole('link', { name: 'Recover the admin account' })).toHaveAttribute('href', '/admin/recover');
  });

  it('asks for the code, then shows the admin accounts and recovers the chosen one', async () => {
    const api = mockApi({
      'POST /admin/recover/lookup': { body: { admins: [ADMIN] } },
      'POST /admin/recover': { body: { email: ADMIN.email } },
    });
    renderApp('/admin/recover');
    await userEvent.click(await screen.findByRole('button', { name: 'Continue' }));
    expect(screen.getByText('Enter the setup code (ADMIN_SETUP_CODE in the server settings).')).toBeInTheDocument();

    await userEvent.type(screen.getByLabelText('Setup code'), CODE);
    await userEvent.click(screen.getByRole('button', { name: 'Continue' }));
    const accounts = await screen.findByRole('group', { name: 'Admin account' });
    expect(within(accounts).getByRole('radio', { name: /owner-admin@example\.com/ })).toBeChecked();

    await userEvent.type(screen.getByLabelText('New password'), 'short');
    await userEvent.click(screen.getByRole('button', { name: 'Recover this account' }));
    expect(screen.getByText(/Use at least 12/)).toBeInTheDocument();
    expect(api.callsTo('POST /admin/recover')).toHaveLength(0);

    await userEvent.clear(screen.getByLabelText('New password'));
    await userEvent.type(screen.getByLabelText('New password'), 'Monsoon-clouds-over-hills-7');
    await userEvent.click(screen.getByRole('button', { name: 'Recover this account' }));
    expect(await screen.findByRole('heading', { name: 'Admin account recovered' })).toBeInTheDocument();
    expect(screen.getByText(ADMIN.email)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Go to admin sign-in' })).toHaveAttribute('href', '/admin');
    expect(api.callsTo('POST /admin/recover')[0]?.body).toEqual({ setupCode: CODE, adminId: ADMIN.id, password: 'Monsoon-clouds-over-hills-7' });
  });

  it.each([
    [apiError(403, 'SETUP_CODE_INVALID', 'The setup code is not correct'), 'The setup code is not correct'],
    [apiError(503, 'RECOVERY_NOT_CONFIGURED', 'Recovery isn’t set up on this server. The operator must set ADMIN_SETUP_CODE in the server environment.'), /Recovery isn’t set up on this server/],
  ])('says why when the code can’t be used (%#)', async (reply, text) => {
    mockApi({ 'POST /admin/recover/lookup': reply });
    renderApp('/admin/recover');
    await userEvent.type(await screen.findByLabelText('Setup code'), 'some-code-1234567890');
    await userEvent.click(screen.getByRole('button', { name: 'Continue' }));
    expect(await screen.findByText(text)).toBeInTheDocument();
  });

  it('points to first-time setup when there is no admin yet', async () => {
    mockApi({ 'POST /admin/recover/lookup': { body: { admins: [] } } });
    renderApp('/admin/recover');
    await userEvent.type(await screen.findByLabelText('Setup code'), CODE);
    await userEvent.click(screen.getByRole('button', { name: 'Continue' }));
    expect(await screen.findByRole('link', { name: 'Create the first admin' })).toHaveAttribute('href', '/admin/setup');
  });
});
