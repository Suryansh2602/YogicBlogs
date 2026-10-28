// The TipTap body editor driven through its toolbar: every block and style it offers must produce JSON the
// server accepts (checked against the backend's own allow-list).
import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { JSONContent } from '@tiptap/react';
import { ArticleBodyEditor } from '../../src/features/editor/ArticleBodyEditor';
import { toServerDoc } from '../../src/features/articles/sanitize';
import type { MediaItem } from '../../src/features/content/api';
import { makeUser, mockApi, session } from '../helpers/api';
/* eslint-disable no-restricted-imports */
// @ts-expect-error: plain JS module from the backend, used only by tests
import { documentProblems } from '../../../backend/src/modules/articles/document.js';
/* eslint-enable no-restricted-imports */

const problems = documentProblems as (doc: unknown) => unknown[];

// jsdom has no layout: ProseMirror asks where things are on screen (to scroll the caret into view).
const rect = { top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0, x: 0, y: 0, toJSON: () => ({}) } as DOMRect;
const rects = () => Object.assign([rect], { item: () => rect }) as unknown as DOMRectList;
Range.prototype.getClientRects = rects;
Range.prototype.getBoundingClientRect = () => rect;
Element.prototype.getClientRects = rects;
document.elementFromPoint = () => null;

const admin = makeUser({ role: 'admin', twoFactorEnabled: true });
const signedIn = { 'GET /auth/csrf': { body: { csrfToken: 'c' } }, 'POST /auth/refresh': session(admin) };
const IMG = '0190a1b2-c3d4-7000-8000-00000000e001';
const OTHER = '0190a1b2-c3d4-7000-8000-0000000000b2';
const media: MediaItem = {
  id: IMG,
  kind: 'image',
  status: 'ready',
  altText: 'Breathing by a window',
  width: 960,
  height: 640,
  sizeBytes: 1000,
  originalName: 'breath.jpg',
  placeholder: null,
  variants: [{ width: 480, height: 320, url: `/media/i/${IMG}/480` }],
  createdAt: '2026-10-28T06:00:00Z',
};

function setup() {
  let latest: JSONContent = { type: 'doc', content: [] };
  const onChange = vi.fn((json: JSONContent) => {
    latest = json;
  });
  const onPickMedia = vi.fn();
  const onPickArticle = vi.fn();
  render(
    <ArticleBodyEditor
      articleId="0190a1b2-c3d4-7000-8000-0000000000a1"
      initial={{ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Breath calms the mind' }] }] }}
      lookups={{ media: (id) => (id === IMG ? media : undefined), article: (id) => (id === OTHER ? { title: 'Sleep well', state: 'draft' } : undefined) }}
      onChange={onChange}
      onPickMedia={onPickMedia}
      onPickArticle={onPickArticle}
    />,
  );
  const surface = screen.getByRole('textbox', { name: 'Article text' });
  return { onChange, onPickMedia, onPickArticle, surface, doc: () => toServerDoc(latest) };
}

/** Put the caret at the end of the text (as a click would). */
async function focusEnd(surface: HTMLElement) {
  await userEvent.click(surface);
}

describe('article body editor', () => {
  it('formats with the toolbar: headings, bold, italic, lists and quotes, all accepted by the server', async () => {
    const { surface, doc } = setup();
    await focusEnd(surface);
    await userEvent.click(screen.getByRole('button', { name: 'Heading' }));
    expect(screen.getByRole('button', { name: 'Heading' })).toHaveAttribute('aria-pressed', 'true');
    await userEvent.click(screen.getByRole('button', { name: 'Subheading' }));
    await userEvent.click(screen.getByRole('button', { name: 'Bulleted list' }));
    await userEvent.click(screen.getByRole('button', { name: 'Numbered list' }));
    await userEvent.click(screen.getByRole('button', { name: 'Quote' }));
    await userEvent.click(screen.getByRole('button', { name: 'Bold' }));
    await userEvent.click(screen.getByRole('button', { name: 'Italic' }));
    await userEvent.click(screen.getByRole('button', { name: 'Undo' }));
    await userEvent.click(screen.getByRole('button', { name: 'Redo' }));
    expect(problems(doc())).toEqual([]);
  });

  it('adds callouts and dividers from their menus, and changes or removes a callout', async () => {
    const { surface, doc } = setup();
    await focusEnd(surface);
    await userEvent.selectOptions(screen.getByLabelText('Insert a callout'), 'doctor');
    await waitFor(() => {
      expect(doc().content?.[0]).toMatchObject({ type: 'callout', attrs: { tone: 'doctor' } });
    });
    const settings = await screen.findByRole('region', { name: 'Callout settings' });
    await userEvent.click(within(settings).getByLabelText('tip'));
    expect(doc().content?.[0]).toMatchObject({ type: 'callout', attrs: { tone: 'tip' } });
    await userEvent.click(within(settings).getByRole('button', { name: 'Remove callout' }));
    expect(doc().content?.[0]?.type).toBe('paragraph');
    await userEvent.selectOptions(screen.getByLabelText('Insert a divider'), 'lotus');
    await waitFor(() => {
      expect(doc().content?.some((b) => b.type === 'divider')).toBe(true);
    });
    expect(problems(doc())).toEqual([]);
  });

  it('inserts a Sanskrit verse through its form, asking for the Devanagari', async () => {
    const { surface, doc } = setup();
    await focusEnd(surface);
    await userEvent.click(screen.getByRole('button', { name: 'Sanskrit verse' }));
    await userEvent.click(screen.getByRole('button', { name: 'Save verse' }));
    expect(screen.getByText('Enter the verse in Devanagari.')).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText('Verse in Devanagari'), 'योगश्चित्तवृत्तिनिरोधः');
    await userEvent.type(screen.getByLabelText('Source, e.g. Yoga Sutra 1.2 (optional)'), 'Yoga Sutra 1.2');
    await userEvent.click(screen.getByRole('button', { name: 'Save verse' }));
    await waitFor(() => {
      expect(doc().content?.some((b) => b.type === 'verse')).toBe(true);
    });
    expect(screen.getByText('— Yoga Sutra 1.2')).toBeInTheDocument();
    expect(problems(doc())).toEqual([]);
  });

  it('inserts a library image, shows it, and edits its alt, caption and size', async () => {
    mockApi({ ...signedIn, 'GET /admin/media': { body: { items: [media], page: 1, pageSize: 48, total: 1 } } });
    const { surface, doc, onPickMedia } = setup();
    await focusEnd(surface);
    await userEvent.click(screen.getByRole('button', { name: 'Image' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Insert Breathing by a window' }));
    expect(onPickMedia).toHaveBeenCalledWith(media);
    await waitFor(() => {
      expect(doc().content?.some((b) => b.type === 'image')).toBe(true);
    });
    expect(screen.getByAltText('Breathing by a window')).toHaveAttribute('src', expect.stringContaining(`/media/i/${IMG}/480`));
    // The new image is selected, so its settings open straight away.
    const settings = await screen.findByRole('region', { name: 'Image settings' });
    await userEvent.type(within(settings).getByLabelText('Caption (optional)'), 'Morning');
    await userEvent.click(within(settings).getByRole('radio', { name: /wide/ }));
    const image = doc().content?.find((b) => b.type === 'image');
    expect(image).toMatchObject({ attrs: { mediaId: IMG, size: 'wide' } });
    expect(problems(doc())).toEqual([]);
  });

  it('refuses an unsafe web link with a clear reason, and applies a safe one', async () => {
    const { surface, doc } = setup();
    await focusEnd(surface);
    await userEvent.keyboard('{Control>}a{/Control}');
    await userEvent.click(screen.getByRole('button', { name: 'Web link' }));
    await userEvent.type(screen.getByLabelText('Web address'), 'javascript:alert(1)');
    await userEvent.click(screen.getByRole('button', { name: 'Apply link' }));
    expect(screen.getByText(/Enter a full web address starting with https:\/\//)).toBeInTheDocument();
    await userEvent.clear(screen.getByLabelText('Web address'));
    await userEvent.type(screen.getByLabelText('Web address'), 'example.org/guide');
    await userEvent.click(screen.getByRole('button', { name: 'Apply link' }));
    expect(JSON.stringify(doc())).toContain('https://example.org/guide');
    expect(problems(doc())).toEqual([]);
  });

  it('links text to another article and adds an “Also read” card, chosen by search', async () => {
    mockApi({
      ...signedIn,
      'GET /admin/articles': {
        body: {
          items: [{ id: OTHER, title: 'Sleep well', status: 'draft', hasUnpublishedChanges: false, slug: null, condition: { id: 'c', name: 'Insomnia' }, accessLevel: 'members', lang: 'en', coverMediaId: null, publishedAt: null, updatedAt: '' }],
          page: 1,
          pageSize: 10,
          total: 1,
        },
      },
    });
    const { surface, doc, onPickArticle } = setup();
    await focusEnd(surface);
    await userEvent.keyboard('{Control>}a{/Control}');
    await userEvent.click(screen.getByRole('button', { name: 'Link to an article' }));
    await userEvent.click(await screen.findByRole('button', { name: /Sleep well/ }));
    expect(onPickArticle).toHaveBeenCalled();
    expect(JSON.stringify(doc())).toContain(`"articleId":"${OTHER}"`);
    await userEvent.click(screen.getByRole('button', { name: 'Also read card' }));
    await userEvent.click(await screen.findByRole('button', { name: /Sleep well/ }));
    await waitFor(() => {
      expect(doc().content?.some((b) => b.type === 'articleCard')).toBe(true);
    });
    expect(screen.getByText(/readers will see plain text until it’s published/)).toBeInTheDocument();
    expect(problems(doc())).toEqual([]);
  });
});

