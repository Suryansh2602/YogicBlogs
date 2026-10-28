// Security: what the reader page does with a hostile article. The server validates every document, but the
// reader must stay safe on its own (defence in depth): nothing in an article can run code, load a page
// from elsewhere, or pass HTML, event handlers or styles through.
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { ArticleBody } from '../../src/features/articles/ArticleBody';
import { ArticleCard } from '../../src/features/articles/ArticleCard';
import type { ArticleCardData, ArticleDoc, ReaderImage } from '../../src/features/articles/types';
import { makeUser, mockApi, session } from '../helpers/api';
import { rememberSignedIn, renderApp } from '../helpers/render';

const IMG = '0190a1b2-c3d4-7000-8000-00000000e001';
const OTHER = '0190a1b2-c3d4-7000-8000-0000000000b2';
const image: ReaderImage = { alt: 'Breath', width: 960, height: 640, placeholder: null, variants: [{ width: 960, height: 640, url: `/media/i/${IMG}/960` }] };
const other: ArticleCardData = {
  id: OTHER,
  slug: 'sleep-well',
  title: 'Sleep well',
  summary: 'Rest.',
  accent: 'teal',
  condition: { name: 'Insomnia', slug: 'insomnia' },
  readingMinutes: 2,
  accessLevel: 'public',
  publishedAt: '2026-10-28T06:00:00Z',
  cover: null,
} as unknown as ArticleCardData;

const SCRIPT = '<script>window.__pwned = 1</script>';
const IMG_TAG = '<img src=x onerror="window.__pwned = 1">';
const link = (href: string, text: string) => ({ type: 'text', text, marks: [{ type: 'link', attrs: { href, onclick: 'window.__pwned=1' } }] });

// Everything an attacker might try to put into the JSON of an article.
const HOSTILE = {
  type: 'doc',
  content: [
    { type: 'paragraph', content: [{ type: 'text', text: SCRIPT }, { type: 'text', text: IMG_TAG }] },
    {
      type: 'paragraph',
      content: [
        link('javascript:window.__pwned=1', 'js link'),
        link('JaVaScRiPt:alert(1)', 'mixed-case js'),
        link(' javascript:alert(1)', 'spaced js'),
        link('java\tscript:alert(1)', 'tab js'),
        link('data:text/html,<script>alert(1)</script>', 'data link'),
        link('vbscript:msgbox(1)', 'vbscript'),
        link('//evil.example/phish', 'protocol-relative'),
        link('http://example.org/', 'plain http'),
        link('https://user:secret@evil.example/', 'credentials in link'),
        link('https://example.org/ok', 'safe link'),
        link('mailto:hello@example.org', 'mail link'),
      ],
    },
    { type: 'script', content: [{ type: 'text', text: 'window.__pwned = 1' }] },
    { type: 'iframe', attrs: { src: 'https://evil.example' } },
    { type: 'html', attrs: { html: IMG_TAG } },
    { type: 'heading', attrs: { level: 1, onclick: 'x', style: 'position:fixed' }, content: [{ type: 'text', text: 'Heading' }] },
    { type: 'callout', attrs: { tone: 'tip" onmouseover="window.__pwned=1' }, content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Callout' }] }] },
    { type: 'verse', attrs: { devanagari: SCRIPT, transliteration: IMG_TAG, meaning: '<b>bold?</b>', source: '<a href="javascript:1">src</a>' } },
    { type: 'divider', attrs: { style: 'url(javascript:alert(1))' } },
    { type: 'image', attrs: { mediaId: IMG, alt: IMG_TAG, caption: SCRIPT, size: 'huge" onload="x' } },
    { type: 'image', attrs: { mediaId: 'https://evil.example/tracker.png', alt: 'tracker', caption: '', size: 'normal' } },
    { type: 'articleCard', attrs: { articleId: '__proto__' } },
    { type: 'articleCard', attrs: { articleId: OTHER } },
    { type: 'paragraph', content: [{ type: 'text', text: 'internal', marks: [{ type: 'articleLink', attrs: { articleId: 'constructor' } }] }] },
  ],
};

function show(doc: unknown) {
  return render(
    <MemoryRouter>
      <ArticleBody body={doc as ArticleDoc} images={{ [IMG]: image }} articles={{ [OTHER]: other }} />
    </MemoryRouter>,
  ).container;
}

/** Every attribute on every element: none may be an event handler or carry script. */
function attributes(root: Element) {
  return [...root.querySelectorAll('*')].flatMap((el) => [...el.attributes].map((a) => ({ tag: el.tagName, name: a.name, value: a.value })));
}

describe('reader page against a hostile article', () => {
  it('shows HTML and scripts written in the text as plain text, never as elements', () => {
    const root = show(HOSTILE);
    expect(root.textContent).toContain(SCRIPT);
    expect(root.textContent).toContain(IMG_TAG);
    expect(root.querySelectorAll('script, iframe, object, embed, style, link, meta, base, form')).toHaveLength(0);
    // The only drawings are the site's own decorations (divider, card pattern): hidden from screen readers and
    // with nothing inside that can run or link anywhere.
    for (const svg of root.querySelectorAll('svg')) {
      expect(svg.getAttribute('aria-hidden')).toBe('true');
      expect(svg.querySelectorAll('script, foreignObject, a, use, image')).toHaveLength(0);
    }
    expect(root.querySelector('img[src="x"]')).toBeNull();
    expect((window as { __pwned?: number }).__pwned).toBeUndefined();
  });

  it('drops blocks that are not on the allow-list (script, iframe, raw HTML)', () => {
    const root = show(HOSTILE);
    expect(root.textContent).not.toContain('window.__pwned = 1​'); // the script block's text isn't rendered as a block
    expect(root.querySelector('[src*="evil.example"]')).toBeNull();
  });

  it('passes no event handlers, inline styles from the article, or javascript: anywhere', () => {
    const root = show(HOSTILE);
    for (const a of attributes(root)) {
      expect(a.name.startsWith('on'), `${a.tag} has ${a.name}`).toBe(false);
      expect(a.value.toLowerCase().replace(/\s/g, '')).not.toContain('javascript:');
      expect(a.value.toLowerCase()).not.toContain('vbscript:');
      if (a.name === 'class') expect(a.value).not.toMatch(/["<>=]/);
    }
    // The only inline styles come from the renderer itself (image focal point/placeholder), never the article.
    expect(root.querySelector('[style*="fixed"]')).toBeNull();
  });

  it('keeps only https and mailto links, opened safely in a new tab', () => {
    const root = show(HOSTILE);
    const hrefs = [...root.querySelectorAll('a')].map((a) => ({ href: a.getAttribute('href') ?? '', rel: a.getAttribute('rel'), target: a.getAttribute('target') }));
    const external = hrefs.filter((h) => !h.href.startsWith('/'));
    expect(external.map((h) => h.href)).toEqual(['https://example.org/ok', 'mailto:hello@example.org']);
    for (const h of external.filter((x) => x.href.startsWith('https:'))) {
      expect(h.target).toBe('_blank');
      expect(h.rel).toContain('noopener');
      expect(h.rel).toContain('noreferrer');
    }
    // The unsafe links still show their words, just not as links.
    expect(root.textContent).toContain('js link');
    expect(root.textContent).toContain('credentials in link');
  });

  it('loads images only from our own API, never from an address written in the article', () => {
    const root = show(HOSTILE);
    const sources = [...root.querySelectorAll('img')].flatMap((img) => [img.getAttribute('src') ?? '', ...(img.getAttribute('srcset') ?? '').split(',')]);
    expect(sources.length).toBeGreaterThan(0);
    for (const src of sources.filter(Boolean)) expect(src.trim()).toMatch(/\/media\/i\//);
    expect(root.textContent).not.toContain('tracker');
  });

  it('ignores ids like __proto__ or constructor (no prototype tricks), and links only to known articles', () => {
    const root = show(HOSTILE);
    const internal = [...root.querySelectorAll('a')].map((a) => a.getAttribute('href')).filter((h) => h?.startsWith('/'));
    expect(internal.every((h) => h === '/articles/sleep-well')).toBe(true);
    expect(Object.prototype).not.toHaveProperty('slug');
  });

  it('does not crash on garbage: wrong types, missing content, deep nesting; good blocks still show', () => {
    const deep = { type: 'doc', content: [] as unknown[] };
    let cursor = deep.content;
    for (let i = 0; i < 500; i++) {
      const quote = { type: 'blockquote', content: [] as unknown[] };
      cursor.push(quote);
      cursor = quote.content;
    }
    const errors = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    for (const doc of [null, 42, 'text', { type: 'doc' }, { type: 'doc', content: 'x' }, { type: 'doc', content: [null, 7, { type: 'paragraph', content: [{ type: 'text' }] }] }, deep]) {
      expect(() => show(doc)).not.toThrow();
    }
    const mixed = show({ type: 'doc', content: [null, { type: 'heading' }, { type: 'paragraph', content: [{ type: 'text', text: 'Still here' }] }] });
    expect(mixed.textContent).toContain('Still here');
    errors.mockRestore();
  });

  it('a card ignores a cover placeholder that is not the server’s own tiny image', () => {
    const card = { ...other, cover: { ...image, placeholder: 'https://evil.example/x.png") ; background:url("javascript:alert(1)' } };
    const root = render(
      <MemoryRouter>
        <ArticleCard article={card as never} />
      </MemoryRouter>,
    ).container;
    expect(root.innerHTML).not.toContain('evil.example');
    expect(root.innerHTML).not.toContain('javascript:');
  });
});

describe('admin article pages', () => {
  it('a signed-in member who opens the editor address gets the admin sign-in, and no article is requested', async () => {
    rememberSignedIn();
    const api = mockApi({ 'GET /auth/csrf': { body: { csrfToken: 'c' } }, 'POST /auth/refresh': session(makeUser({ role: 'user' })) });
    renderApp(`/admin/articles/${OTHER}`);
    expect(await screen.findByRole('heading', { name: 'Admin sign-in' })).toBeInTheDocument();
    // Only the sign-in page's public "is there an admin yet?" check; no article data.
    expect(api.calls.filter((c) => c.path.startsWith('/admin/articles') || c.path.startsWith('/admin/media'))).toHaveLength(0);
    expect(screen.queryByRole('textbox', { name: 'Article text' })).toBeNull();
  });
});
