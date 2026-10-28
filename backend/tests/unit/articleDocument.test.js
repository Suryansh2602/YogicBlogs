// The article body allow-list, attacked with hostile documents; plus text extraction, references and the
// reader clean-up that hides unpublished articles.
import { describe, expect, it } from 'vitest';
import {
  assertValidDocument,
  collectReferences,
  countWords,
  documentProblems,
  extractText,
  linkProblem,
  readerBody,
  readingMinutes,
} from '../../src/modules/articles/document.js';

const A = '0190a1b2-c3d4-7000-8000-0000000000a1';
const B = '0190a1b2-c3d4-7000-8000-0000000000b2';
const IMG = '0190a1b2-c3d4-7000-8000-00000000e001';

const p = (...content) => ({ type: 'paragraph', content });
const t = (text, marks) => (marks ? { type: 'text', text, marks } : { type: 'text', text });
const doc = (...content) => ({ type: 'doc', content });

const GOOD = doc(
  { type: 'heading', attrs: { level: 2 }, content: [t('Why migraines happen')] },
  p(t('Breath '), t('slows', [{ type: 'bold' }]), t(' the mind. See '), t('the guide', [{ type: 'link', attrs: { href: 'https://example.org/guide' } }]), t(' and '), t('this one', [{ type: 'articleLink', attrs: { articleId: A } }])),
  { type: 'bulletList', content: [{ type: 'listItem', content: [p(t('Sit tall')), { type: 'orderedList', attrs: { start: 3 }, content: [{ type: 'listItem', content: [p(t('Inhale'))] }] }] }] },
  { type: 'callout', attrs: { tone: 'doctor' }, content: [p(t('See a doctor if pain is sudden and severe.'))] },
  { type: 'verse', attrs: { devanagari: 'योगश्चित्तवृत्तिनिरोधः', transliteration: 'yogaś citta-vṛtti-nirodhaḥ', meaning: 'Yoga is the stilling of the mind.', source: 'Yoga Sūtra 1.2' } },
  { type: 'divider', attrs: { style: 'lotus' } },
  { type: 'image', attrs: { mediaId: IMG, alt: 'Child’s pose', caption: null, size: 'wide' } },
  { type: 'articleCard', attrs: { articleId: B } },
  { type: 'blockquote', content: [p(t('Line one'), { type: 'hardBreak' }, t('line two'))] },
);

describe('document allow-list', () => {
  it('accepts every allowed block, style and attribute (TipTap writes unset attributes as null)', () => {
    expect(documentProblems(GOOD)).toEqual([]);
    expect(documentProblems(doc())).toEqual([]);
  });

  it.each([
    ['an unknown block', doc({ type: 'iframe', attrs: { src: 'https://evil.example' } }), 'body.content[0]', '"iframe" is not an allowed block'],
    ['raw HTML smuggled as a block', doc({ type: 'html', content: [t('<script>alert(1)</script>')] }), 'body.content[0]', '"html" is not an allowed block'],
    ['an unknown attribute', doc({ type: 'paragraph', attrs: { onclick: 'alert(1)' }, content: [t('x')] }), 'body.content[0].attrs.onclick', 'is not allowed here'],
    ['an extra key on a node', doc({ type: 'paragraph', content: [t('x')], innerHTML: '<b>x</b>' }), 'body.content[0].innerHTML', 'is not allowed here'],
    ['a heading level 1', doc({ type: 'heading', attrs: { level: 1 }, content: [t('x')] }), 'body.content[0].attrs.level', 'must be one of 2, 3'],
    ['a heading without a level', doc({ type: 'heading', content: [t('x')] }), 'body.content[0].attrs.level', 'is required'],
    ['a list item inside a paragraph', doc(p({ type: 'listItem', content: [p(t('x'))] })), 'body.content[0].content[0]', '"listItem" can\'t go inside "paragraph"'],
    ['a list item that starts with a list', doc({ type: 'bulletList', content: [{ type: 'listItem', content: [{ type: 'bulletList', content: [{ type: 'listItem', content: [p(t('x'))] }] }] }] }), 'body.content[0].content[0].content[0]', 'must start with a paragraph'],
    ['an empty list', doc({ type: 'bulletList', content: [] }), 'body.content[0].content', 'must not be empty'],
    ['an image with a bad id', doc({ type: 'image', attrs: { mediaId: '../../etc/passwd' } }), 'body.content[0].attrs.mediaId', 'must be an id'],
    ['an image size not in the presets', doc({ type: 'image', attrs: { mediaId: IMG, size: 'giant' } }), 'body.content[0].attrs.size', 'must be one of normal, wide, full'],
    ['a callout colour instead of a tone', doc({ type: 'callout', attrs: { tone: '#ff0000' }, content: [p(t('x'))] }), 'body.content[0].attrs.tone', 'must be one of note, tip, caution, doctor'],
    ['an unknown style', doc(p(t('x', [{ type: 'textStyle', attrs: { color: 'red' } }]))), 'body.content[0].content[0].marks[0]', '"textStyle" is not an allowed style'],
    ['a repeated style', doc(p(t('x', [{ type: 'bold' }, { type: 'bold' }]))), 'body.content[0].content[0].marks[1]', 'repeats a style'],
    ['an empty text', doc(p(t(''))), 'body.content[0].content[0].text', 'must be non-empty text'],
    ['a raw newline in text', doc(p(t('a\nb'))), 'body.content[0].content[0].text', 'contains hidden control characters or raw line breaks'],
    ['a right-to-left override hiding a file name', doc(p(t('photo\u202egpj.exe'))), 'body.content[0].content[0].text', 'contains hidden control characters or raw line breaks'],
    ['text on a block', doc({ type: 'paragraph', text: 'x' }), 'body.content[0].text', 'is only allowed on text'],
    ['content on a divider', doc({ type: 'divider', attrs: { style: 'line' }, content: [t('x')] }), 'body.content[0].content', 'is not allowed here'],
    ['a block that is not a document', p(t('x')), 'body', 'must be a document (type "doc")'],
    ['a non-object', doc('<p>hi</p>'), 'body.content[0]', 'must be a block with a type'],
    ['attrs that are a list', doc({ type: 'paragraph', attrs: ['x'], content: [t('x')] }), 'body.content[0].attrs', 'must be an object'],
    ['a prototype-pollution key', doc({ type: 'paragraph', attrs: JSON.parse('{"__proto__":{"isAdmin":true}}'), content: [t('x')] }), 'body.content[0].attrs.__proto__', 'is not allowed here'],
  ])('refuses %s', (_label, body, path, message) => {
    expect(documentProblems(body)).toContainEqual({ path, message });
  });

  it.each([
    ['javascript:alert(1)', 'must start with https:// (or be a mailto: email link)'],
    ['JaVaScRiPt:alert(1)', 'must start with https:// (or be a mailto: email link)'],
    ['data:text/html,<script>alert(1)</script>', 'must start with https:// (or be a mailto: email link)'],
    ['http://example.org', 'must start with https:// (or be a mailto: email link)'],
    ['//evil.example/x', 'is not a complete web address (start it with https://)'],
    ['https://user:pass@example.org', 'must not contain a user name or password'],
    ['https://example.org/a b', 'must not contain spaces or hidden characters'],
    [' https://example.org', 'must not contain spaces or hidden characters'],
    ['https://example.org/\u202eexe', 'must not contain spaces or hidden characters'],
    [`https://example.org/${'a'.repeat(2100)}`, 'has 2120 characters; keep it to 2048'],
  ])('refuses the link %j', (href, message) => {
    expect(linkProblem(href)).toBe(message);
  });

  it('accepts https and mailto links', () => {
    expect(linkProblem('https://www.ayush.gov.in/')).toBeNull();
    expect(linkProblem('mailto:care@healthmarg.example')).toBeNull();
  });

  it('refuses a link that is both a web link and an article link', () => {
    const body = doc(p(t('x', [{ type: 'link', attrs: { href: 'https://a.example' } }, { type: 'articleLink', attrs: { articleId: A } }])));
    expect(documentProblems(body)).toContainEqual({ path: 'body.content[0].content[0].marks', message: 'can link to a web address or an article, not both' });
  });

  it('stops cheaply on documents that are too deep, too big or too long', () => {
    // Lists are the only blocks that nest, so depth is built with them.
    let nested = { type: 'bulletList', content: [{ type: 'listItem', content: [p(t('x'))] }] };
    for (let i = 0; i < 15; i += 1) nested = { type: 'bulletList', content: [{ type: 'listItem', content: [p(t('x')), nested] }] };
    expect(documentProblems(doc(nested))[0].message).toBe('is nested more than 20 levels deep');

    const many = doc(...Array.from({ length: 6000 }, () => p(t('x'))));
    expect(documentProblems(many)).toEqual([{ path: 'body', message: 'has more than 10000 parts; split it into several articles' }]);

    const long = doc(...Array.from({ length: 11 }, () => p(t('a'.repeat(19_000)))));
    expect(documentProblems(long)).toEqual([{ path: 'body', message: 'has more than 2,00,000 characters of text; split it into several articles' }]);
  });

  it('reports at most 20 problems, and as a 400 with paths under "draft"', () => {
    const bad = doc(...Array.from({ length: 50 }, () => ({ type: 'marquee' })));
    expect(documentProblems(bad)).toHaveLength(20);
    const err = (() => {
      try {
        assertValidDocument(doc({ type: 'marquee' }));
      } catch (e) {
        return e;
      }
      return null;
    })();
    expect(err).toMatchObject({ statusCode: 400, code: 'INVALID_DOCUMENT' });
    expect(err.details[0]).toEqual({ path: 'draft.body.content[0]', message: 'content[0] "marquee" is not an allowed block' });
  });
});

describe('text, words and references', () => {
  it('extracts readable text with line breaks between blocks, including the verse', () => {
    const plain = extractText(GOOD);
    expect(plain.split('\n')).toEqual(
      expect.arrayContaining(['Why migraines happen', 'Breath slows the mind. See the guide and this one', 'योगश्चित्तवृत्तिनिरोधः', 'Yoga is the stilling of the mind.']),
    );
    expect(plain).not.toMatch(/\n\n/);
  });

  it('counts words for English and Hindi, and gives at least one minute', () => {
    expect(countWords('Breath slows the mind')).toBe(4);
    expect(countWords('योग मन को शांत करता है')).toBe(6);
    expect(countWords('   ')).toBe(0);
    expect(readingMinutes(0)).toBe(1);
    expect(readingMinutes(201)).toBe(2);
  });

  it('collects article links, cards and images', () => {
    const refs = collectReferences(GOOD);
    expect([...refs.links]).toEqual([A]);
    expect([...refs.cards]).toEqual([B]);
    expect(refs.images).toEqual([{ mediaId: IMG, alt: 'Child’s pose' }]);
  });

  it('hides unpublished articles from readers: the link text stays plain, the card goes, no id is left', () => {
    const visible = readerBody(GOOD, (id) => id === B);
    const json = JSON.stringify(visible);
    expect(json).not.toContain(A);
    expect(json).toContain(B);
    expect(json).toContain('this one');
    const hidden = readerBody(GOOD, () => false);
    expect(JSON.stringify(hidden)).not.toMatch(new RegExp(`${A}|${B}`));
    expect(JSON.stringify(GOOD)).toContain(A); // the stored document is untouched
  });

  it('drops images whose file is gone', () => {
    const withImage = JSON.stringify(readerBody(GOOD, () => true, () => true));
    expect(withImage).toContain(IMG);
    expect(JSON.stringify(readerBody(GOOD, () => true, () => false))).not.toContain(IMG);
  });
});
