// Contract: what the editor produces, after toServerDoc, must pass the SERVER's own allow-list
// (backend/src/modules/articles/document.js is imported directly), so the two can never drift apart.
import { describe, expect, it } from 'vitest';
import { safeHref, toServerDoc } from '../../src/features/articles/sanitize';
// @ts-expect-error: plain JS module from the backend, used only by this test
import { documentProblems } from '../../../backend/src/modules/articles/document.js';

const problems = documentProblems as (doc: unknown) => { path: string; message: string }[];

// What TipTap 3 actually emits: extra attributes (link target/rel/class, ordered-list type, null defaults).
const FROM_EDITOR = {
  type: 'doc',
  content: [
    { type: 'heading', attrs: { level: 2, textAlign: null }, content: [{ type: 'text', text: 'Why breath helps' }] },
    {
      type: 'paragraph',
      attrs: { textAlign: null },
      content: [
        { type: 'text', text: 'Read ' },
        { type: 'text', text: 'the guide', marks: [{ type: 'link', attrs: { href: 'https://example.org/', target: '_blank', rel: 'noopener noreferrer nofollow', class: null } }] },
        { type: 'text', text: ' and ' },
        { type: 'text', text: 'this', marks: [{ type: 'articleLink', attrs: { articleId: '0190a1b2-c3d4-7000-8000-0000000000a1' } }, { type: 'bold' }] },
        { type: 'hardBreak' },
        { type: 'text', text: 'pasted\nline' },
        { type: 'text', text: 'struck', marks: [{ type: 'strike' }] },
      ],
    },
    { type: 'orderedList', attrs: { start: 1, type: null }, content: [{ type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Inhale' }] }] }] },
    { type: 'callout', attrs: { tone: 'tip' }, content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Morning is best.' }] }] },
    { type: 'verse', attrs: { devanagari: 'योगश्चित्तवृत्तिनिरोधः', transliteration: null, meaning: '', source: null } },
    { type: 'divider', attrs: { style: 'lotus' } },
    { type: 'image', attrs: { mediaId: '0190a1b2-c3d4-7000-8000-00000000e001', alt: null, caption: '', size: 'wide' } },
    { type: 'articleCard', attrs: { articleId: '0190a1b2-c3d4-7000-8000-0000000000b2' } },
    { type: 'codeBlock', content: [{ type: 'text', text: 'rm -rf /' }] },
    { type: 'paragraph', content: [{ type: 'text', text: '' }] },
  ],
};

describe('editor → server contract', () => {
  it('trims editor JSON so the server accepts it', () => {
    expect(problems(FROM_EDITOR).length).toBeGreaterThan(0); // as emitted, the server would refuse it
    const clean = toServerDoc(FROM_EDITOR);
    expect(problems(clean)).toEqual([]);
    const json = JSON.stringify(clean);
    expect(json).not.toMatch(/target|rel"|class|textAlign|codeBlock|strike|"type":null/);
    expect(json).toContain('pasted line');
  });

  it('keeps everything the server allows', () => {
    const clean = toServerDoc(FROM_EDITOR);
    expect(clean.content?.map((b) => b.type)).toEqual(['heading', 'paragraph', 'orderedList', 'callout', 'verse', 'divider', 'image', 'articleCard', 'paragraph']);
    expect(JSON.stringify(clean)).toContain('"href":"https://example.org/"');
  });

  it('turns anything that is not a document into an empty one', () => {
    expect(toServerDoc(null)).toEqual({ type: 'doc', content: [] });
    expect(toServerDoc({ type: 'paragraph' })).toEqual({ type: 'doc', content: [] });
  });

  it.each([
    ['https://example.org/a', 'https://example.org/a'],
    ['mailto:care@example.org', 'mailto:care@example.org'],
    ['javascript:alert(1)', null],
    ['http://example.org', null],
    ['https://user:pass@example.org', null],
    [42, null],
  ])('safeHref(%j) → %j', (input, expected) => {
    expect(safeHref(input)).toBe(expected);
  });
});
