// The build step that puts each public page's HTML into its file (config/prerenderPlugin.ts).
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { injectPage, inlineStyles, mainFonts, pageAssets, pageFile, unfinishedParts } from '../../config/prerenderPlugin';

const SHELL = `<!doctype html>
<html lang="en">
  <head>
    <title>Healthmarg</title>
    <script src="/theme-init.js"></script>
  </head>
  <body>
    <div id="root"></div>
  </body>
</html>`;

describe('prerender build step', () => {
  it('puts each page in the file a static host serves for its address', () => {
    expect(pageFile('dist', '/')).toBe(join('dist', 'index.html'));
    expect(pageFile('dist', '/ritucharya')).toBe(join('dist', 'ritucharya', 'index.html'));
  });

  it('fills the root, names the path and build time, and marks the page before theme-init.js runs', () => {
    const html = injectPage(SHELL, { path: '/ritucharya', markup: '<main><h1>Six seasons</h1></main>', renderedAt: 1793690400000 });
    expect(html).toContain('<div id="root" data-prerendered="/ritucharya" data-rendered-at="1793690400000"><main><h1>Six seasons</h1></main></div>');
    const meta = html.indexOf('<meta name="hm-prerendered" content="/ritucharya" />');
    expect(meta).toBeGreaterThan(-1);
    expect(meta).toBeLessThan(html.indexOf('<script src="/theme-init.js">')); // theme-init.js must see it
  });

  it('links the page’s own code and styles in its head, once each, so they download with the main script', () => {
    const shell = SHELL.replace('</head>', '  <link rel="modulepreload" crossorigin href="/assets/jsx.js">\n  </head>');
    const html = injectPage(shell, {
      path: '/ritucharya',
      markup: '',
      renderedAt: 1,
      assets: { scripts: ['/assets/Ritu.js', '/assets/jsx.js'], styles: ['/assets/Ritu.css'] },
    });
    expect(html).toContain('<link rel="stylesheet" crossorigin href="/assets/Ritu.css">');
    expect(html).toContain('<link rel="modulepreload" crossorigin href="/assets/Ritu.js">');
    expect(html.match(/href="\/assets\/jsx\.js"/g)).toHaveLength(1);
    expect(html.indexOf('/assets/Ritu.css')).toBeLessThan(html.indexOf('</head>'));
  });

  it('collects a page’s code, its imports and their styles from the manifest, but not the main bundle', () => {
    const manifest = {
      'index.html': { file: 'assets/index.js', css: ['assets/index.css'], imports: ['_jsx.js'] },
      '_jsx.js': { file: 'assets/jsx.js' },
      '_Button.js': { file: 'assets/Button.js', css: ['assets/button.css'], imports: ['_jsx.js'] },
      'src/pages/RitucharyaPage.tsx': { file: 'assets/Ritu.js', css: ['assets/Ritu.css'], imports: ['_jsx.js', 'index.html', '_Button.js'] },
    };
    expect(pageAssets(manifest, 'src/pages/RitucharyaPage.tsx')).toEqual({
      scripts: ['/assets/Ritu.js', '/assets/jsx.js', '/assets/Button.js'],
      styles: ['/assets/Ritu.css', '/assets/button.css'],
    });
    expect(pageAssets(manifest, null)).toEqual({ scripts: [], styles: [] });
    expect(() => pageAssets(manifest, 'src/pages/Missing.tsx')).toThrow(/no src\/pages\/Missing\.tsx/);
  });

  it('preloads the two main fonts, and fails the build if they move', () => {
    const manifest = {
      'index.html': {
        file: 'assets/index.js',
        assets: ['assets/fraunces-latin-wght-normal-a1.woff2', 'assets/fraunces-latin-ext-wght-normal-b2.woff2', 'assets/dm-sans-latin-wght-normal-c3.woff2', 'assets/tiro-devanagari-hindi-devanagari-400-normal-d4.woff2'],
      },
    };
    const fonts = mainFonts(manifest);
    expect(fonts).toEqual(['/assets/fraunces-latin-wght-normal-a1.woff2', '/assets/dm-sans-latin-wght-normal-c3.woff2']);
    const html = injectPage(SHELL, { path: '/', markup: '', renderedAt: 1, assets: { scripts: [], styles: [], fonts } });
    expect(html).toContain('<link rel="preload" as="font" type="font/woff2" crossorigin href="/assets/dm-sans-latin-wght-normal-c3.woff2">');
    expect(() => mainFonts({ 'index.html': { file: 'assets/index.js', assets: [] } })).toThrow(/two main font files/);
  });

  it('keeps "$" in the page text as it is (no replacement patterns)', () => {
    expect(injectPage(SHELL, { path: '/', markup: '<p>$& and $1</p>', renderedAt: 1 })).toContain('<p>$&amp; and $1</p>'.replace('&amp;', '&'));
  });

  it('refuses a page without an empty root or the theme script', () => {
    expect(() => injectPage(SHELL.replace('<div id="root"></div>', '<div id="root">x</div>'), { path: '/', markup: '', renderedAt: 1 })).toThrow(/empty/);
    expect(() => injectPage(SHELL.replace('<script src="/theme-init.js"></script>', ''), { path: '/', markup: '', renderedAt: 1 })).toThrow(/theme-init/);
  });

  it('finds what would leave a page unfinished: inline scripts and sections React did not finish', () => {
    expect(unfinishedParts('<!--$--><main><h1>Terms</h1></main><!--/$-->')).toEqual([]);
    expect(unfinishedParts('<!--$?--><template id="B:0"></template><div hidden id="S:0"></div><script>$RC("B:0","S:0")</script>')).toEqual([
      'an inline <script>',
      'a section still loading (<!--$?-->)',
    ]);
    expect(unfinishedParts('<!--$!--><template></template><!--/$-->')).toEqual(['a section that failed to render (<!--$!-->)']);
  });

  it('finds inline style attributes, which the CSP would block', () => {
    expect(inlineStyles('<span class="logo"><svg width="38"></svg></span>')).toEqual([]);
    expect(inlineStyles('<p>style="not an attribute" in text</p>')).toEqual([]);
    expect(inlineStyles('<span class="logo" style="--logo-size:38px">')).toEqual(['<span class="logo" style="--logo-size:38px">']);
  });
});
