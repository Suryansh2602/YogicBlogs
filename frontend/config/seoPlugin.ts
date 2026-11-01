// After the build: robots.txt gets its sitemap line, and each fixed page gets its own copy of index.html
// with the right title and description, for crawlers and link previews that don't run JavaScript. The root
// index.html is also the fallback for every other address, so it must not claim a canonical of its own.
import { appendFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { Plugin } from 'vite';
import { DEFAULT_IMAGE, STATIC_PAGES, type PageSeo } from '../src/seo/pages.ts';

const escapeHtml = (text: string) => text.replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');

/** Turns the preview image into a full address, which link previews require. */
export const withAbsoluteImage = (html: string, site: string) =>
  html.replace(`content="${DEFAULT_IMAGE}"`, () => `content="${site}${DEFAULT_IMAGE}"`);

/** A fixed page's copy of index.html. */
export function pageHtml(html: string, page: PageSeo, site: string) {
  const title = escapeHtml(page.title);
  const description = escapeHtml(page.description);
  const url = escapeHtml(`${site}${page.path}`);
  return html
    .replace(/<title>.*<\/title>/, () => `<title>${title}</title>`)
    .replace(/<meta name="description" content="[^"]*" \/>/, () => `<meta name="description" content="${description}" />`)
    .replace(/<meta property="og:title" content="[^"]*" \/>/, () => `<meta property="og:title" content="${title}" />`)
    .replace(/<meta property="og:description" content="[^"]*" \/>/, () => `<meta property="og:description" content="${description}" />`)
    .replace('</head>', () => `  <link rel="canonical" href="${url}" />\n    <meta property="og:url" content="${url}" />\n  </head>`);
}

export function seoPlugin(siteUrl: string | undefined): Plugin {
  const site = siteUrl?.replace(/\/+$/, '');
  return {
    name: 'healthmarg-seo',
    apply: 'build',
    async writeBundle({ dir }) {
      if (!dir) return;
      if (!site) {
        console.warn('VITE_SITE_URL is not set: building without canonical addresses, page copies or a sitemap line.');
        return;
      }
      const indexPath = join(dir, 'index.html');
      const html = withAbsoluteImage(await readFile(indexPath, 'utf8'), site);
      await writeFile(indexPath, html);
      await appendFile(join(dir, 'robots.txt'), `Sitemap: ${site}/sitemap.xml\n`);
      for (const page of STATIC_PAGES.filter((p) => p.path !== '/')) {
        const folder = join(dir, page.path);
        await mkdir(folder, { recursive: true });
        await writeFile(join(folder, 'index.html'), pageHtml(html, page, site));
      }
    },
  };
}
