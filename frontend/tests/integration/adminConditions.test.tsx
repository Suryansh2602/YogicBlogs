import { beforeAll, describe, expect, it } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { makeUser, mockApi, session } from '../helpers/api';
import { preloadPages, rememberSignedIn, renderApp } from '../helpers/render';

beforeAll(preloadPages, 60_000);

const admin = makeUser({ id: '0190a1b2-c3d4-7000-8000-0000000000aa', email: 'guru@example.com', displayName: 'Guru Admin', role: 'admin', twoFactorEnabled: true });
const restore = { 'GET /auth/csrf': { body: { csrfToken: 'c' } }, 'POST /auth/refresh': session(admin) };
const condition = (over: Record<string, unknown> = {}) => ({
  id: '0190a1b2-c3d4-7000-8000-00000000c001',
  name: 'Migraine',
  slug: 'migraine',
  summary: 'Recurring headaches.',
  description: null,
  sortOrder: 0,
  isPublished: true,
  articleCount: 2,
  createdAt: '2026-10-25T10:00:00Z',
  updatedAt: '2026-10-25T10:00:00Z',
  ...over,
});

describe('admin conditions page', () => {
  it('lists conditions with their article counts and status', async () => {
    rememberSignedIn();
    mockApi({ ...restore, 'GET /admin/conditions': { body: { items: [condition(), condition({ id: 'c2', name: 'Insomnia', slug: 'insomnia', isPublished: false, articleCount: 0 })] } } });
    renderApp('/admin/conditions');
    const table = await screen.findByRole('table');
    expect(await within(table).findByText('Migraine')).toBeInTheDocument();
    expect(within(table).getByText('/insomnia')).toBeInTheDocument();
    expect(within(table).getByText('Published')).toBeInTheDocument();
    expect(within(table).getByText('Hidden')).toBeInTheDocument();
  });

  it('creates a condition: the web address follows the name, and problems are named exactly', async () => {
    rememberSignedIn();
    const api = mockApi({
      ...restore,
      'GET /admin/conditions': { body: { items: [] } },
      'POST /admin/conditions': { status: 201, body: { condition: condition({ name: 'Lower Back Pain', slug: 'lower-back-pain', articleCount: 0 }) } },
    });
    renderApp('/admin/conditions');
    await userEvent.click(await screen.findByRole('button', { name: 'New condition' }));
    await userEvent.click(screen.getByRole('button', { name: 'Create condition' }));
    expect(screen.getByText('Enter a name, like "Migraine".')).toBeInTheDocument();

    await userEvent.type(screen.getByLabelText('Name'), 'Lower Back Pain');
    expect(screen.queryByText(/Enter a name/)).not.toBeInTheDocument();
    expect(screen.getByLabelText('Web address')).toHaveValue('lower-back-pain');
    await userEvent.type(screen.getByLabelText('Summary'), 'Posture and gentle asanas.');
    await userEvent.click(screen.getByRole('button', { name: 'Create condition' }));
    expect(await screen.findByText('“Lower Back Pain” was saved.')).toBeInTheDocument();
    expect(api.callsTo('POST /admin/conditions')[0]?.body).toEqual({
      name: 'Lower Back Pain',
      slug: 'lower-back-pain',
      summary: 'Posture and gentle asanas.',
      isPublished: false,
    });
  });

  it('asks for a typed web address when the name has no English letters, and checks its format', async () => {
    rememberSignedIn();
    mockApi({ ...restore, 'GET /admin/conditions': { body: { items: [] } } });
    renderApp('/admin/conditions');
    await userEvent.click(await screen.findByRole('button', { name: 'New condition' }));
    await userEvent.type(screen.getByLabelText('Name'), 'माइग्रेन');
    await userEvent.click(screen.getByRole('button', { name: 'Create condition' }));
    expect(screen.getByText(/no English letters to build a web address/)).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText('Web address'), 'Migraine Hindi');
    await userEvent.click(screen.getByRole('button', { name: 'Create condition' }));
    expect(screen.getByText(/lowercase letters, numbers and single hyphens/)).toBeInTheDocument();
  });

  it('shows a duplicate name under the name field', async () => {
    rememberSignedIn();
    const message = 'A condition called "Migraine" already exists. Use a different name.';
    mockApi({
      ...restore,
      'GET /admin/conditions': { body: { items: [condition()] } },
      'POST /admin/conditions': { status: 409, body: { error: { message, code: 'NAME_TAKEN', details: [{ path: 'name', message }] } } },
    });
    renderApp('/admin/conditions');
    await userEvent.click(await screen.findByRole('button', { name: 'New condition' }));
    await userEvent.type(screen.getByLabelText('Name'), 'Migraine');
    await userEvent.click(screen.getByRole('button', { name: 'Create condition' }));
    expect(await screen.findByText(message)).toBeInTheDocument();
  });

  it('confirms before deleting, and explains when articles still use the condition', async () => {
    rememberSignedIn();
    const api = mockApi({
      ...restore,
      'GET /admin/conditions': { body: { items: [condition()] } },
      'DELETE /admin/conditions/0190a1b2-c3d4-7000-8000-00000000c001': {
        status: 409,
        body: { error: { message: '2 articles use this condition. Move them to another condition first.', code: 'CONDITION_IN_USE' } },
      },
    });
    renderApp('/admin/conditions');
    await userEvent.click(await screen.findByRole('button', { name: 'Delete Migraine' }));
    expect(api.callsTo('DELETE /admin/conditions/0190a1b2-c3d4-7000-8000-00000000c001')).toHaveLength(0);
    // Focus is on the safe choice: pressing Enter keeps the condition.
    expect(screen.getByRole('button', { name: 'Keep' })).toHaveFocus();
    await userEvent.click(screen.getByRole('button', { name: 'Yes, delete' }));
    expect(await screen.findByText('2 articles use this condition. Move them to another condition first.')).toBeInTheDocument();
  });

  it('edits an existing condition', async () => {
    rememberSignedIn();
    const api = mockApi({
      ...restore,
      'GET /admin/conditions': { body: { items: [condition()] } },
      'PATCH /admin/conditions/0190a1b2-c3d4-7000-8000-00000000c001': { body: { condition: condition({ isPublished: false }) } },
    });
    renderApp('/admin/conditions');
    await userEvent.click(await screen.findByRole('button', { name: 'Edit' }));
    expect(screen.getByLabelText('Web address')).toHaveValue('migraine');
    await userEvent.click(screen.getByRole('checkbox'));
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    await waitFor(() => {
      expect(api.callsTo('PATCH /admin/conditions/0190a1b2-c3d4-7000-8000-00000000c001')[0]?.body).toMatchObject({ isPublished: false, slug: 'migraine' });
    });
  });
});
