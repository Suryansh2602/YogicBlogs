// Reader pages (list, article, teaser, redirect, not found) and the admin side (list, create, editor
// autosave, publish problems, inbound-link confirmation), against the scripted fake API.
import { beforeAll, describe, expect, it } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { apiError, makeUser, mockApi, session } from '../helpers/api';
import { preloadPages, rememberSignedIn, renderApp } from '../helpers/render';

beforeAll(preloadPages, 60_000);

const ID = '0190a1b2-c3d4-7000-8000-0000000000a1';
const OTHER = '0190a1b2-c3d4-7000-8000-0000000000b2';
const COND = '0190a1b2-c3d4-7000-8000-00000000c001';
const image = { alt: 'Breathing by a window', width: 960, height: 640, placeholder: null, variants: [{ width: 480, height: 320, url: '/media/i/x/480' }] };
const card = (over: Record<string, unknown> = {}) => ({
  slug: 'calming-migraine',
  title: 'Calming migraine with breath',
  summary: 'A gentle breathing routine that can ease a migraine.',
  accent: 'teal',
  accessLevel: 'public',
  cover: image,
  lang: 'en',
  condition: { slug: 'migraine', name: 'Migraine' },
  coverFocus: { x: 50, y: 50 },
  readingMinutes: 4,
  publishedAt: '2026-10-20T10:00:00Z',
  ...over,
});
const fullArticle = (over: Record<string, unknown> = {}) => ({
  ...card(),
  updatedAt: '2026-10-25T10:00:00Z',
  seo: { title: 'Calming migraine with breath', description: null },
  locked: false,
  body: {
    type: 'doc',
    content: [
      { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Why breath helps' }] },
      {
        type: 'paragraph',
        content: [
          { type: 'text', text: 'See ' },
          { type: 'text', text: 'the guide', marks: [{ type: 'link', attrs: { href: 'https://example.org/' } }] },
          { type: 'text', text: ' and ' },
          { type: 'text', text: 'this one', marks: [{ type: 'articleLink', attrs: { articleId: OTHER } }] },
        ],
      },
      { type: 'callout', attrs: { tone: 'doctor' }, content: [{ type: 'paragraph', content: [{ type: 'text', text: 'See a doctor for sudden pain.' }] }] },
      { type: 'verse', attrs: { devanagari: 'योगश्चित्तवृत्तिनिरोधः', meaning: 'Yoga stills the mind.' } },
    ],
  },
  images: {},
  articles: { [OTHER]: card({ slug: 'sleep-well', title: 'Sleep well' }) },
  related: [card({ slug: 'sleep-well', title: 'Sleep well' })],
  ...over,
});

describe('reader pages', () => {
  it('lists published articles with condition filters and loads more', async () => {
    mockApi({
      'GET /conditions': { body: { items: [{ id: COND, name: 'Migraine', slug: 'migraine', summary: null }] } },
      'GET /articles': (call) =>
        call.path.includes('cursor=')
          ? { body: { items: [card({ slug: 'older', title: 'An older article' })], nextCursor: null } }
          : { body: { items: [card()], nextCursor: 'next-page' } },
    });
    renderApp('/articles');
    const list = await screen.findByRole('list', { name: 'Articles' });
    expect(await within(list).findByText('Calming migraine with breath')).toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'Filter by condition' })).toHaveTextContent('Migraine');
    await userEvent.click(screen.getByRole('button', { name: /Load more/ }));
    expect(await within(list).findByText('An older article')).toBeInTheDocument();
  });

  it('renders an article from its JSON: headings, safe links, article links, callouts, verse, related, disclaimer', async () => {
    mockApi({ 'GET /articles/calming-migraine': { body: { article: fullArticle() } } });
    renderApp('/articles/calming-migraine');
    expect(await screen.findByRole('heading', { level: 1, name: 'Calming migraine with breath' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: 'Why breath helps' })).toBeInTheDocument();
    const external = screen.getByRole('link', { name: /the guide/ });
    expect(external).toHaveAttribute('href', 'https://example.org/');
    expect(external).toHaveAttribute('rel', 'noopener noreferrer nofollow');
    expect(screen.getByRole('link', { name: 'this one' })).toHaveAttribute('href', '/articles/sleep-well');
    expect(screen.getByRole('note', { name: 'Ask your doctor' })).toHaveTextContent('See a doctor for sudden pain.');
    expect(screen.getByText('योगश्चित्तवृत्तिनिरोधः')).toBeInTheDocument();
    expect(screen.getAllByText('Sleep well').length).toBeGreaterThan(0);
    expect(screen.getByText(/For education only, not medical advice/)).toBeInTheDocument();
    await waitFor(() => {
      expect(document.title).toMatch(/Calming migraine with breath/);
    });
  });

  it('shows a members teaser with sign-in links when signed out', async () => {
    mockApi({ 'GET /articles/members-only': { body: { article: { ...card({ accessLevel: 'members' }), updatedAt: null, seo: { title: 'x', description: null }, locked: true, reason: 'SIGN_IN_REQUIRED' } } } });
    renderApp('/articles/members-only');
    expect(await screen.findByText('This article is for members. Sign in to read it.')).toBeInTheDocument();
    const teaser = screen.getByRole('note', { name: 'This article is for members. Sign in to read it.' });
    expect(within(teaser).getByRole('link', { name: 'Sign in' })).toHaveAttribute('href', '/signin');
  });

  it('follows an old address to the new one, and explains a missing article', async () => {
    mockApi({
      'GET /articles/old-address': { body: { redirect: 'calming-migraine' } },
      'GET /articles/calming-migraine': { body: { article: fullArticle() } },
      'GET /articles/nothing-here': apiError(404, 'NOT_FOUND', 'This article doesn’t exist or isn’t published.'),
    });
    const router = renderApp('/articles/old-address');
    expect(await screen.findByRole('heading', { level: 1, name: 'Calming migraine with breath' })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/articles/calming-migraine');
  });

  it('says plainly when an article does not exist', async () => {
    mockApi({ 'GET /articles/nothing-here': apiError(404, 'NOT_FOUND', 'This article doesn’t exist or isn’t published.') });
    renderApp('/articles/nothing-here');
    expect(await screen.findByRole('link', { name: /articles/i })).toBeInTheDocument();
    expect(screen.getByText(/doesn’t exist|not found|couldn’t find/i)).toBeInTheDocument();
  });
});

const admin = makeUser({ id: '0190a1b2-c3d4-7000-8000-0000000000aa', role: 'admin', twoFactorEnabled: true, displayName: 'Guru Admin' });
const restore = { 'GET /auth/csrf': { body: { csrfToken: 'c' } }, 'POST /auth/refresh': session(admin) };
const draft = {
  title: 'Calming migraine with breath',
  slug: '',
  summary: '',
  conditionId: COND,
  accessLevel: 'members',
  lang: 'en',
  accent: 'saffron',
  cover: { mediaId: null, alt: '', focalX: 50, focalY: 50 },
  relatedIds: [],
  seoTitle: '',
  seoDescription: '',
  body: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Hello' }] }] },
};
const adminArticle = (over: Record<string, unknown> = {}) => ({
  id: ID,
  status: 'draft',
  slug: null,
  publishedAt: null,
  contentUpdatedAt: null,
  liveVersion: 0,
  draftVersion: 1,
  draft,
  savedAt: '2026-10-28T06:00:00Z',
  savedBy: 'Guru Admin',
  hasUnpublishedChanges: false,
  references: [],
  inboundCount: 0,
  checklist: { ready: false, slug: 'calming-migraine-with-breath', words: 1, problems: [{ field: 'summary', message: 'The short description has 0 characters. Write at least 40.', blocking: true }] },
  ...over,
});
const conditions = { body: { items: [{ id: COND, name: 'Migraine', slug: 'migraine', summary: null, description: null, sortOrder: 0, isPublished: true, articleCount: 0, createdAt: '', updatedAt: '' }] } };
const emptyMedia = { body: { items: [], page: 1, pageSize: 100, total: 0 } };

describe('admin articles', () => {
  it('lists articles and creates one, opening the editor', async () => {
    rememberSignedIn();
    const api = mockApi({
      ...restore,
      'GET /admin/conditions': conditions,
      'GET /admin/articles': { body: { items: [], page: 1, pageSize: 20, total: 0 } },
      'POST /admin/articles': { status: 201, body: { article: adminArticle() } },
      [`GET /admin/articles/${ID}`]: { body: { article: adminArticle() } },
      'GET /admin/media': emptyMedia,
    });
    renderApp('/admin/articles');
    expect(await screen.findByText('No articles yet. Create the first one.')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'New article' }));
    await userEvent.click(screen.getByRole('button', { name: 'Create and start writing' }));
    expect(screen.getByText('Give it a title of at least 3 characters (you can change it later).')).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText('Title'), 'Calming migraine with breath');
    await userEvent.click(screen.getByRole('button', { name: 'Create and start writing' }));
    expect(await screen.findByRole('heading', { name: 'Card and thumbnail' })).toBeInTheDocument();
    expect(api.callsTo('POST /admin/articles')[0]?.body).toEqual({ title: 'Calming migraine with breath', conditionId: COND });
  });

  it('autosaves the whole draft with its version 3 s after a change, and shows the checklist', async () => {
    rememberSignedIn();
    const api = mockApi({
      ...restore,
      'GET /admin/conditions': conditions,
      [`GET /admin/articles/${ID}`]: { body: { article: adminArticle() } },
      'GET /admin/media': emptyMedia,
      [`PUT /admin/articles/${ID}/draft`]: { body: { draftVersion: 2, savedAt: '2026-10-28T06:05:00Z', hasUnpublishedChanges: false } },
      [`GET /admin/articles/${ID}/checklist`]: { body: { ready: false, problems: [] } },
    });
    renderApp(`/admin/articles/${ID}`);
    expect(await screen.findByText('The short description has 0 characters. Write at least 40.')).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText('Short description'), 'Breath');
    expect(screen.getByRole('status')).toHaveTextContent('Unsaved changes…');
    await waitFor(
      () => {
        expect(api.callsTo(`PUT /admin/articles/${ID}/draft`)).toHaveLength(1);
      },
      { timeout: 8_000 },
    );
    const sent = api.callsTo(`PUT /admin/articles/${ID}/draft`)[0]?.body as { draftVersion: number; draft: typeof draft };
    expect(sent.draftVersion).toBe(1);
    expect(sent.draft.summary).toBe('Breath');
    expect(sent.draft.body).toEqual(draft.body); // the editor's JSON, trimmed to the allow-list
    expect(await screen.findByText(/^Saved · /)).toBeInTheDocument();
  });

  it('shows every problem when publishing is refused, and asks before unpublishing a linked-to article', async () => {
    rememberSignedIn();
    mockApi({
      ...restore,
      'GET /admin/conditions': conditions,
      [`GET /admin/articles/${ID}`]: { body: { article: adminArticle({ status: 'published', slug: 'calming', inboundCount: 2 }) } },
      'GET /admin/media': emptyMedia,
      [`POST /admin/articles/${ID}/publish`]: {
        status: 422,
        body: { error: { message: 'This article isn’t ready to publish yet.', code: 'PUBLISH_CHECKLIST', details: [{ field: 'cover', message: 'Choose a thumbnail image.', blocking: true }] } },
      },
      [`POST /admin/articles/${ID}/unpublish`]: [
        apiError(409, 'HAS_INBOUND_LINKS', '2 published articles link here. If you unpublish, those links become plain text.'),
        { body: { article: adminArticle({ status: 'draft' }) } },
      ],
    });
    renderApp(`/admin/articles/${ID}`);
    await userEvent.click(await screen.findByRole('button', { name: 'Publish changes' }));
    expect(await screen.findByText('Choose a thumbnail image.')).toBeInTheDocument();
    expect(screen.getByText('Not published yet: fix the items below.')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Unpublish' }));
    const ask = await screen.findByRole('alertdialog');
    expect(ask).toHaveTextContent(/2 published articles link here/);
    expect(screen.getByRole('button', { name: 'Keep it' })).toHaveFocus();
    await userEvent.click(screen.getByRole('button', { name: 'Yes, unpublish' }));
    expect(await screen.findByText('Unpublished.')).toBeInTheDocument();
  });

  it('restoring this browser’s unsaved copy saves it to the server', async () => {
    rememberSignedIn();
    const mine = { ...draft, summary: 'Typed before the tab crashed' };
    localStorage.setItem(`hm-draft-${ID}`, JSON.stringify({ draft: mine, basedOnVersion: 1, at: '2026-10-28T06:10:00Z' }));
    const api = mockApi({
      ...restore,
      'GET /admin/conditions': conditions,
      [`GET /admin/articles/${ID}`]: { body: { article: adminArticle() } },
      'GET /admin/media': emptyMedia,
      [`PUT /admin/articles/${ID}/draft`]: { body: { draftVersion: 2, savedAt: '2026-10-28T06:15:00Z', hasUnpublishedChanges: false } },
      [`GET /admin/articles/${ID}/checklist`]: { body: { ready: false, problems: [] } },
    });
    renderApp(`/admin/articles/${ID}`);
    await userEvent.click(await screen.findByRole('button', { name: 'Restore them' }));
    expect(await screen.findByDisplayValue('Typed before the tab crashed')).toBeInTheDocument();
    await waitFor(
      () => {
        expect(api.callsTo(`PUT /admin/articles/${ID}/draft`)).toHaveLength(1);
      },
      { timeout: 8_000 },
    );
    expect((api.callsTo(`PUT /admin/articles/${ID}/draft`)[0]?.body as { draft: typeof draft }).draft.summary).toBe('Typed before the tab crashed');
  });

  it('warns before restoring a browser copy made before someone else’s save', async () => {
    rememberSignedIn();
    localStorage.setItem(`hm-draft-${ID}`, JSON.stringify({ draft: { ...draft, summary: 'Old copy' }, basedOnVersion: 1, at: '2026-10-28T06:10:00Z' }));
    mockApi({
      ...restore,
      'GET /admin/conditions': conditions,
      [`GET /admin/articles/${ID}`]: { body: { article: adminArticle({ draftVersion: 3 }) } },
      'GET /admin/media': emptyMedia,
    });
    renderApp(`/admin/articles/${ID}`);
    expect(await screen.findByText(/Someone saved this article after them/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Restore them anyway' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Keep them as a new article' })).toBeInTheDocument();
  });

  it('says why when the history can’t be loaded or a revision can’t be saved', async () => {
    rememberSignedIn();
    mockApi({
      ...restore,
      'GET /admin/conditions': conditions,
      [`GET /admin/articles/${ID}`]: { body: { article: adminArticle() } },
      'GET /admin/media': emptyMedia,
      [`GET /admin/articles/${ID}/revisions`]: apiError(400, 'BAD_REQUEST', 'The history couldn’t be loaded.'),
      [`POST /admin/articles/${ID}/revisions`]: apiError(400, 'BAD_REQUEST', 'The revision couldn’t be saved.'),
    });
    renderApp(`/admin/articles/${ID}`);
    await userEvent.click(await screen.findByRole('button', { name: 'Show revisions' }));
    expect(await screen.findByText(/history couldn’t be loaded/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Save a revision' }));
    expect(await screen.findByText(/revision couldn’t be saved/)).toBeInTheDocument();
  });

  it('saves pending changes first, then publishes with the newest version', async () => {
    rememberSignedIn();
    const api = mockApi({
      ...restore,
      'GET /admin/conditions': conditions,
      [`GET /admin/articles/${ID}`]: { body: { article: adminArticle() } },
      'GET /admin/media': emptyMedia,
      [`PUT /admin/articles/${ID}/draft`]: { body: { draftVersion: 2, savedAt: '2026-10-28T06:05:00Z', hasUnpublishedChanges: false } },
      [`GET /admin/articles/${ID}/checklist`]: { body: { ready: true, problems: [] } },
      [`POST /admin/articles/${ID}/publish`]: { body: { article: adminArticle({ status: 'published', slug: 'calming', draftVersion: 2 }), warnings: [] } },
    });
    renderApp(`/admin/articles/${ID}`);
    await userEvent.type(await screen.findByLabelText('Short description'), ' calm');
    await userEvent.click(screen.getByRole('button', { name: 'Publish' }));
    expect(await screen.findByText('Published: readers can see it now.')).toBeInTheDocument();
    expect(api.callsTo(`PUT /admin/articles/${ID}/draft`)).toHaveLength(1); // saved at once, not after 3 s
    expect(api.callsTo(`POST /admin/articles/${ID}/publish`)[0]?.body).toEqual({ draftVersion: 2 });
    expect(screen.getByRole('button', { name: 'Publish changes' })).toBeInTheDocument();
  });

  it('does not publish while the latest changes can’t be saved', async () => {
    rememberSignedIn();
    const api = mockApi({
      ...restore,
      'GET /admin/conditions': conditions,
      [`GET /admin/articles/${ID}`]: { body: { article: adminArticle() } },
      'GET /admin/media': emptyMedia,
      [`PUT /admin/articles/${ID}/draft`]: apiError(400, 'INVALID_DOCUMENT', 'The article body has something that isn’t allowed.'),
      [`POST /admin/articles/${ID}/publish`]: { body: { article: adminArticle({ status: 'published' }), warnings: [] } },
    });
    renderApp(`/admin/articles/${ID}`);
    await userEvent.type(await screen.findByLabelText('Short description'), 'x');
    await userEvent.click(screen.getByRole('button', { name: 'Publish' }));
    expect(await screen.findByText(/Your latest changes aren’t saved yet, so this wasn’t done/)).toBeInTheDocument();
    expect(api.callsTo(`POST /admin/articles/${ID}/publish`)).toHaveLength(0);
  });

  it('on a conflict, “Load their version” loads the newest copy and still offers mine', async () => {
    rememberSignedIn();
    let conflicted = false;
    const theirs = adminArticle({ draftVersion: 3, draft: { ...draft, summary: 'Their newer text' }, savedBy: 'Other Admin' });
    mockApi({
      ...restore,
      'GET /admin/conditions': conditions,
      // The newer copy exists only once their save has happened (the page may load twice in StrictMode).
      [`GET /admin/articles/${ID}`]: () => ({ body: { article: conflicted ? theirs : adminArticle() } }),
      'GET /admin/media': emptyMedia,
      [`PUT /admin/articles/${ID}/draft`]: () => {
        conflicted = true;
        return { status: 409, body: { error: { message: 'Other Admin saved this article after you opened it.', code: 'STALE_VERSION', details: { draftVersion: 3, savedBy: 'Other Admin' } } } };
      },
    });
    renderApp(`/admin/articles/${ID}`);
    await userEvent.type(await screen.findByLabelText('Short description'), 'Mine');
    expect(await screen.findByText('Someone else saved this article', {}, { timeout: 8_000 })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Publish' })).toBeDisabled();
    await userEvent.click(screen.getByRole('button', { name: 'Load their version' }));
    expect(await screen.findByDisplayValue('Their newer text')).toBeInTheDocument();
    expect(screen.getByText(/Loaded the newest version/)).toBeInTheDocument();
    // My text was kept in this browser; it was based on an older version, so restoring warns first.
    expect(screen.getByText(/Someone saved this article after them/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Keep them as a new article' })).toBeInTheDocument();
  });

  it('deletes after asking, then returns to the list with a message', async () => {
    rememberSignedIn();
    const api = mockApi({
      ...restore,
      'GET /admin/conditions': conditions,
      [`GET /admin/articles/${ID}`]: { body: { article: adminArticle() } },
      'GET /admin/media': emptyMedia,
      [`DELETE /admin/articles/${ID}`]: { status: 204 },
      'GET /admin/articles': { body: { items: [], page: 1, pageSize: 20, total: 0 } },
    });
    renderApp(`/admin/articles/${ID}`);
    await userEvent.click(await screen.findByRole('button', { name: 'Delete' }));
    expect(await screen.findByRole('alertdialog')).toHaveTextContent(/Delete “Calming migraine with breath”\?/);
    await userEvent.click(screen.getByRole('button', { name: 'Yes, delete' }));
    expect(await screen.findByText('“Calming migraine with breath” was deleted.')).toBeInTheDocument();
    expect(api.callsTo(`DELETE /admin/articles/${ID}`)[0]?.body).toEqual({ draftVersion: 1, confirm: true });
  });
});
