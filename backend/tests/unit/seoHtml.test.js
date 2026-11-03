// Filling index.html for an article: right tags, one of each, and hostile text stays plain text.
import { describe, expect, it } from 'vitest';
import { articlePage, emptyShell, escapeHtml, missingPage } from '../../src/modules/seo/seo.html.js';

const TEMPLATE = `<html lang="en"><head>
    <meta name="description" content="Default" />
    <title>Default title</title>
    <meta property="og:site_name" content="Healthmarg" />
    <meta property="og:title" content="Default" />
    <meta property="og:image" content="https://site.example/og-default.png" />
    <meta name="twitter:card" content="summary_large_image" />
    <script src="/theme-init.js"></script>
  </head><body><div id="root"></div><script type="module" src="/assets/index.js"></script></body></html>`;

const PLACE = { site: 'https://site.example', image: 'https://site.example/og-default.png' };
const ARTICLE = {
  slug: 'calm-breath',
  title: 'Calm breath',
  summary: 'A short summary.',
  lang: 'en',
  accessLevel: 'public',
  publishedAt: '2026-10-01T00:00:00.000Z',
  updatedAt: '2026-10-05T00:00:00.000Z',
  seo: { title: 'Calm breath guide', description: 'For search results.' },
  locked: false,
  body: {
    type: 'doc',
    content: [
      { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Why it helps' }] },
      { type: 'paragraph', content: [{ type: 'text', text: 'Breathe ' }, { type: 'text', text: 'slowly' }] },
      { type: 'bulletList', content: [{ type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'In the morning' }] }] }] },
      { type: 'verse', attrs: { devanagari: 'योगः', meaning: 'Yoga' } },
    ],
  },
};
const jsonLd = (html) => JSON.parse(/<script id="seo-jsonld" type="application\/ld\+json">(.*?)<\/script>/.exec(html)[1]);

describe('article page', () => {
  it('puts the article in the head, with one of each tag', () => {
    const html = articlePage(TEMPLATE, ARTICLE, PLACE);
    expect(html.match(/<title>/g)).toHaveLength(1);
    expect(html.match(/name="description"/g)).toHaveLength(1);
    expect(html.match(/property="og:title"/g)).toHaveLength(1);
    expect(html).toContain('<title>Calm breath guide · Healthmarg</title>');
    expect(html).toContain('<meta name="description" content="For search results." />');
    expect(html).toContain('<link rel="canonical" href="https://site.example/articles/calm-breath" />');
    expect(html).toContain('<meta property="og:type" content="article" />');
    expect(html).not.toContain('Default');
  });

  it('keeps the app running: its scripts and root stay', () => {
    const html = articlePage(TEMPLATE, ARTICLE, PLACE);
    expect(html).toContain('<div id="root"></div>');
    expect(html).toContain('src="/assets/index.js"');
    expect(html).toContain('src="/theme-init.js"');
  });

  it('copies the text into noscript, with headings, lists and verses', () => {
    const noscript = /<noscript>(.*)<\/noscript>/.exec(articlePage(TEMPLATE, ARTICLE, PLACE))[1];
    expect(noscript).toContain('<h1>Calm breath</h1>');
    expect(noscript).toContain('<h2>Why it helps</h2>');
    expect(noscript).toContain('<p>Breathe slowly</p>');
    expect(noscript).toContain('<p>In the morning</p>');
    expect(noscript).toContain('<p>योगः</p>');
  });

  it('states the article and its breadcrumb in structured data', () => {
    const [article, crumbs] = jsonLd(articlePage(TEMPLATE, ARTICLE, PLACE));
    expect(article).toMatchObject({ '@type': 'Article', headline: 'Calm breath', dateModified: '2026-10-05T00:00:00.000Z' });
    expect(article.author.name).toBe('Healthmarg');
    expect(article.isAccessibleForFree).toBeUndefined();
    expect(crumbs.itemListElement.at(-1).item).toBe('https://site.example/articles/calm-breath');
  });

  it('sets the page language from the article', () => {
    expect(articlePage(TEMPLATE, { ...ARTICLE, lang: 'hi' }, PLACE)).toContain('<html lang="hi">');
  });

  it('sends a members article as a teaser: never the body, and marked as paywalled', () => {
    const teaser = { ...ARTICLE, accessLevel: 'members', locked: true, body: undefined };
    const html = articlePage(TEMPLATE, teaser, PLACE);
    expect(html).toContain('A short summary.');
    expect(html).not.toContain('Breathe');
    expect(jsonLd(html)[0]).toMatchObject({ isAccessibleForFree: false, hasPart: { cssSelector: '.article-lock' } });
  });
});

describe('prerendered index.html (Home with its HTML built in)', () => {
  const PRERENDERED = TEMPLATE.replace('<script src="/theme-init.js">', '<meta name="hm-prerendered" content="/" />\n    <script src="/theme-init.js">').replace(
    '<body><div id="root"></div>',
    '<body><div id="root" data-prerendered="/" data-rendered-at="1793690400000"><div class="layout"><main><h1>Ancient wisdom</h1></main><div>footer</div></div></div>',
  );

  it('starts empty for an article: no Home HTML, no path marker, and the noscript text in place', () => {
    const shell = emptyShell(PRERENDERED);
    expect(shell).not.toContain('Ancient wisdom');
    expect(shell).not.toContain('hm-prerendered');
    expect(shell).not.toContain('data-prerendered');
    const html = articlePage(shell, ARTICLE, PLACE);
    expect(html).toContain('<div id="root"></div><noscript><article><h1>Calm breath</h1>');
    expect(html).toContain('src="/assets/index.js"');
    expect(html).toContain('src="/theme-init.js"');
  });

  it('leaves an ordinary index.html as it is', () => {
    expect(emptyShell(TEMPLATE)).toBe(TEMPLATE);
  });
});

describe('hostile article text', () => {
  const ATTACK = '</title></script><script>alert(1)</script><img src=x onerror=alert(2)>"\'';
  const hostile = {
    ...ARTICLE,
    title: ATTACK,
    summary: ATTACK,
    seo: { title: ATTACK, description: ATTACK },
    body: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: ATTACK }] }, { type: 'verse', attrs: { meaning: ATTACK } }] },
  };

  it('stays plain text everywhere it appears', () => {
    const html = articlePage(TEMPLATE, hostile, PLACE);
    expect(html).not.toContain('<script>alert');
    expect(html).not.toContain('<img src=x');
    expect(html.match(/<title>/g)).toHaveLength(1);
    expect(html.match(/<\/title>/g)).toHaveLength(1);
    expect(jsonLd(html)[0].headline).toBe(ATTACK);
  });

  it('does not treat $ in article text as a replacement pattern', () => {
    const html = articlePage(TEMPLATE, { ...ARTICLE, seo: { title: "$& $' $`", description: '$1' } }, PLACE);
    expect(html).toContain('<title>$&amp; $&#39; $` · Healthmarg</title>');
    expect(html.match(/<head>/g)).toHaveLength(1);
  });

  it('allows only heading levels 2 to 4', () => {
    const body = { type: 'doc', content: [{ type: 'heading', attrs: { level: '9><script>' }, content: [{ type: 'text', text: 'x' }] }] };
    expect(articlePage(TEMPLATE, { ...ARTICLE, body }, PLACE)).toContain('<h2>x</h2>');
  });

  it('escapes every special character', () => {
    expect(escapeHtml(`&<>"'`)).toBe('&amp;&lt;&gt;&quot;&#39;');
    expect(escapeHtml(null)).toBe('');
  });
});

describe('missing article', () => {
  it('asks not to be listed and keeps the site working', () => {
    const html = missingPage(TEMPLATE);
    expect(html).toContain('<meta name="robots" content="noindex" />');
    expect(html).toContain('<title>Article not found · Healthmarg</title>');
    expect(html).toContain('src="/assets/index.js"');
    expect(html).not.toContain('og:title');
  });
});
