// After the build, renders the public pages to HTML and puts it in each page's file, so phones can paint the
// text before the app's code has downloaded and run (docs/page-speed.md). A server build of the app does the
// rendering; it lives in node_modules/ while it runs, so its imports resolve, and is deleted afterwards.
// It runs after seoPlugin, so each page keeps the head that plugin gave it.
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import react from '@vitejs/plugin-react';
import { build, type Plugin, type ResolvedConfig } from 'vite';
import { PRERENDER_PAGE_MODULES, PRERENDER_PATHS } from '../src/prerender/paths.ts';

const ROOT = '<div id="root"></div>';
const THEME_SCRIPT = '<script src="/theme-init.js"></script>';

/** Where a page's file lives in the build: "/" is index.html, "/terms" is terms/index.html. */
export const pageFile = (outDir: string, path: string) => (path === '/' ? join(outDir, 'index.html') : join(outDir, path.slice(1), 'index.html'));

/**
 * The page's file with its HTML in #root. The root also names the path and the build time (the browser
 * hydrates with that same time), and a meta tag before theme-init.js lets that script spot a page served for
 * another address.
 */
export function injectPage(html: string, { path, markup, renderedAt, assets = { scripts: [], styles: [] } }: { path: string; markup: string; renderedAt: number; assets?: PageAssets }) {
  if (!html.includes(ROOT)) throw new Error(`Prerendering ${path}: the page has no empty ${ROOT}`);
  if (!html.includes(THEME_SCRIPT)) throw new Error(`Prerendering ${path}: the page has no ${THEME_SCRIPT}`);
  // The main fonts, so the text paints in them at once instead of swapping (and shifting) later; then the
  // page's own code and styles, fetched alongside the main script instead of after it has run.
  const links = [
    ...(assets.fonts ?? []).map((href) => `<link rel="preload" as="font" type="font/woff2" crossorigin href="${href}">`),
    ...assets.styles.filter((href) => !html.includes(`href="${href}"`)).map((href) => `<link rel="stylesheet" crossorigin href="${href}">`),
    ...assets.scripts.filter((href) => !html.includes(`href="${href}"`)).map((href) => `<link rel="modulepreload" crossorigin href="${href}">`),
  ];
  return html
    .replace(THEME_SCRIPT, () => `<meta name="hm-prerendered" content="${path}" />\n    ${THEME_SCRIPT}`)
    .replace('</head>', () => `${links.map((l) => `  ${l}\n`).join('')}  </head>`)
    .replace(ROOT, () => `<div id="root" data-prerendered="${path}" data-rendered-at="${String(renderedAt)}">${markup}</div>`);
}

export interface PageAssets {
  scripts: string[];
  styles: string[];
  fonts?: string[];
}

interface ManifestChunk {
  file: string;
  css?: string[];
  assets?: string[];
  imports?: string[];
}

/**
 * The Latin files of the heading and body fonts (Fraunces, DM Sans): what almost every line of text uses.
 * The Devanagari font is larger and used for short phrases, so it is not preloaded.
 */
export function mainFonts(manifest: Record<string, ManifestChunk>, base = '/'): string[] {
  const fonts = (manifest['index.html']?.assets ?? []).filter((file) => /(^|\/)(fraunces|dm-sans)-latin-wght-normal-[^/]+\.woff2$/.test(file));
  if (fonts.length !== 2) throw new Error(`Prerendering: expected the two main font files in the manifest, found ${String(fonts.length)}`);
  return fonts.map((file) => base + file);
}

/** A lazily loaded page's code and styles, with everything it imports, from the build's manifest. */
export function pageAssets(manifest: Record<string, ManifestChunk>, module: string | null, base = '/'): PageAssets {
  const scripts = new Set<string>();
  const styles = new Set<string>();
  const visit = (key: string) => {
    const chunk = manifest[key];
    // index.html is the main bundle: the page already loads it.
    if (!chunk || key === 'index.html' || scripts.has(base + chunk.file)) return;
    scripts.add(base + chunk.file);
    for (const css of chunk.css ?? []) styles.add(base + css);
    for (const dep of chunk.imports ?? []) visit(dep);
  };
  if (module) {
    if (!manifest[module]) throw new Error(`Prerendering: the build manifest has no ${module}`);
    visit(module);
  }
  return { scripts: [...scripts], styles: [...styles] };
}

/**
 * Inline style attributes in the HTML. The recommended CSP blocks them, and React does not reapply them after
 * hydration, so each one would stay broken: the build refuses them.
 */
export function inlineStyles(markup: string): string[] {
  return [...markup.matchAll(/<[a-zA-Z][^>]*?\sstyle="[^"]*"[^>]*>/g)].map((m) => m[0].slice(0, 120));
}

/**
 * What would leave a page unfinished: an inline script (the CSP blocks it), or a section React didn't finish
 * in place (`<!--$?-->` pending, `<!--$!-->` failed), which it would only complete with such a script.
 */
export function unfinishedParts(markup: string): string[] {
  const found: string[] = [];
  if (/<script\b/i.test(markup)) found.push('an inline <script>');
  if (markup.includes('<!--$?-->')) found.push('a section still loading (<!--$?-->)');
  if (markup.includes('<!--$!-->')) found.push('a section that failed to render (<!--$!-->)');
  return found;
}

export interface ServerEntry {
  renderPage: (path: string, renderedAt: number) => Promise<string>;
}

/**
 * Builds the server version of the app (src/prerender/entry.tsx) into `outDir` and loads it. `isolated`
 * bundles its own copy of React and the router: tests use that, so the build's renderer and the browser's
 * never share context objects in one process, just as they don't in real use.
 */
export async function buildServerEntry({ root, mode, outDir, isolated = false }: { root: string; mode: string; outDir: string; isolated?: boolean }) {
  await build({
    configFile: false,
    root,
    mode,
    logLevel: 'warn',
    plugins: [react()],
    ...(isolated && { ssr: { noExternal: true } }),
    build: {
      ssr: 'src/prerender/entry.tsx',
      outDir,
      emptyOutDir: true,
      rollupOptions: { output: { entryFileNames: '[name].mjs', chunkFileNames: '[name]-[hash].mjs' } },
    },
  });
  return (await import(pathToFileURL(join(outDir, 'entry.mjs')).href)) as ServerEntry;
}

/**
 * `vite preview` serves a page's folder only with a trailing slash ("/ritucharya/"), and index.html (Home)
 * otherwise. Real hosts serve the folder's page for "/ritucharya" too; so does the preview, so tests see
 * what readers will.
 */
function previewPages(): Plugin {
  return {
    name: 'healthmarg-prerender-preview',
    configurePreviewServer(server) {
      server.middlewares.use((req, _res, next) => {
        const url = new URL(req.url ?? '/', 'http://preview.invalid');
        const path = url.pathname.replace(/\/+$/, '') || '/';
        if (req.method === 'GET' && path !== '/' && (PRERENDER_PATHS as readonly string[]).includes(path)) req.url = `${path}/index.html${url.search}`;
        next();
      });
    },
  };
}

export function prerenderPlugin(): Plugin[] {
  return [buildPages(), previewPages()];
}

function buildPages(): Plugin {
  let config: ResolvedConfig;
  return {
    name: 'healthmarg-prerender',
    apply: 'build',
    configResolved(resolved) {
      config = resolved;
    },
    async closeBundle() {
      if (config.build.ssr) return;
      const outDir = resolve(config.root, config.build.outDir);
      const shell = await readFile(join(outDir, 'index.html'), 'utf8');
      // An empty page for hosts that can use it as their fallback for other addresses (docs/page-speed.md).
      await writeFile(join(outDir, 'app.html'), shell);

      const serverDir = join(config.root, 'node_modules', '.healthmarg-prerender');
      try {
        const entry = await buildServerEntry({ root: config.root, mode: config.mode, outDir: serverDir });
        const manifest = JSON.parse(await readFile(join(outDir, '.vite', 'manifest.json'), 'utf8')) as Record<string, ManifestChunk>;
        const fonts = mainFonts(manifest, config.base);
        const renderedAt = Date.now();
        for (const path of PRERENDER_PATHS) {
          const file = pageFile(outDir, path);
          const template = await readFile(file, 'utf8').catch(() => shell);
          const markup = await entry.renderPage(path, renderedAt);
          const styles = inlineStyles(markup);
          if (styles.length) throw new Error(`Prerendering ${path}: inline style attributes, which the CSP blocks:\n${styles.join('\n')}`);
          const unfinished = unfinishedParts(markup);
          if (unfinished.length) throw new Error(`Prerendering ${path}: the HTML has ${unfinished.join(' and ')}`);
          await mkdir(dirname(file), { recursive: true });
          const assets = { ...pageAssets(manifest, PRERENDER_PAGE_MODULES[path], config.base), fonts };
          await writeFile(file, injectPage(template, { path, markup, renderedAt, assets }));
        }
        config.logger.info(`Prerendered ${String(PRERENDER_PATHS.length)} pages: ${PRERENDER_PATHS.join(', ')}`);
      } finally {
        await rm(serverDir, { recursive: true, force: true });
      }
    },
  };
}
