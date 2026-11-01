// The build step's copies of index.html: the right head for each fixed page, and nothing lost.
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { pageHtml, seoPlugin, withAbsoluteImage } from '../../config/seoPlugin';

const SITE = 'https://healthmarg.example';
const HTML = `<html><head>
<meta name="description" content="Default" />
<title>Default title</title>
<meta property="og:title" content="Default" />
<meta property="og:description" content="Default" />
<meta property="og:image" content="/og-default.png" />
</head><body><div id="root"></div></body></html>`;

describe('page copies', () => {
  it('replaces the head for one page and keeps exactly one of each tag', () => {
    const html = pageHtml(HTML, { path: '/ritucharya', title: 'Seasons · Healthmarg', description: 'About seasons' }, SITE);
    expect(html.match(/<title>/g)).toHaveLength(1);
    expect(html).toContain('<title>Seasons · Healthmarg</title>');
    expect(html).toContain('<meta name="description" content="About seasons" />');
    expect(html).toContain(`<link rel="canonical" href="${SITE}/ritucharya" />`);
    expect(html).not.toContain('Default');
  });

  it('escapes text and leaves $ patterns alone', () => {
    const html = pageHtml(HTML, { path: '/x', title: 'A "$&" <b>', description: "$' & more" }, SITE);
    expect(html).toContain('<title>A &quot;$&amp;&quot; &lt;b&gt;</title>');
    expect(html).toContain('content="$\' &amp; more"');
  });

  it('makes the preview image a full address', () => {
    expect(withAbsoluteImage(HTML, SITE)).toContain(`content="${SITE}/og-default.png"`);
  });
});

describe('after the build', () => {
  let dir: string;
  const run = (site: string | undefined) => (seoPlugin(site).writeBundle as (options: { dir: string }) => Promise<void>)({ dir });

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'seo-'));
    await writeFile(join(dir, 'index.html'), HTML);
    await writeFile(join(dir, 'robots.txt'), 'User-agent: *\nAllow: /\n');
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('writes each fixed page and the sitemap line, and gives the root no canonical', async () => {
    await run(`${SITE}/`);
    expect(await readFile(join(dir, 'robots.txt'), 'utf8')).toContain(`Sitemap: ${SITE}/sitemap.xml`);
    expect(await readFile(join(dir, 'articles', 'index.html'), 'utf8')).toContain(`href="${SITE}/articles"`);
    expect(await readFile(join(dir, 'terms', 'index.html'), 'utf8')).toContain('Terms of Use');
    expect(await readFile(join(dir, 'index.html'), 'utf8')).not.toContain('rel="canonical"');
  });

  it('warns and changes nothing without a site address', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    await run(undefined);
    expect(warn).toHaveBeenCalledOnce();
    expect(await readFile(join(dir, 'index.html'), 'utf8')).toBe(HTML);
  });
});
