// Performance budget for the production build (run after `vite build`; part of `npm run qa`).
// Fails if the first-load JavaScript, any lazily loaded page, the article editor, or the CSS grows past its
// budget, so the site can't get slow by accident. Sizes are gzipped, as they travel over the network.
// Also proves that reader pages never load editor code (TipTap/ProseMirror is for admins only).
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';

const DIST = 'dist';
const ASSETS = join(DIST, 'assets');
const KB = 1024;
const BUDGET = {
  entryJs: 115 * KB, // React + router + app shell (React alone is ~60 kB of this)
  lazyChunk: 25 * KB, // any single page loaded on demand
  editor: 150 * KB, // the admin article editor and everything only it loads (TipTap + ProseMirror)
  totalCss: 20 * KB,
};
const EDITOR_PAGE = 'src/pages/admin/AdminArticleEditor.tsx';
const READER_PAGES = ['src/pages/articles/ArticlesPage.tsx', 'src/pages/articles/ArticlePage.tsx'];

const gz = (file) => gzipSync(readFileSync(join(ASSETS, file))).length;
const files = readdirSync(ASSETS);
const html = readFileSync(join(DIST, 'index.html'), 'utf8');
const entry = /src="\/assets\/([^"]+\.js)"/.exec(html)?.[1];
if (!entry) throw new Error('Could not find the entry script in dist/index.html');

// The manifest says which chunks each page imports (vite build.manifest).
const manifestPath = join(DIST, '.vite', 'manifest.json');
const manifest = existsSync(manifestPath) ? JSON.parse(readFileSync(manifestPath, 'utf8')) : {};
/** Every JS file a manifest entry loads statically (itself + its imports, recursively). */
function closure(key, seen = new Set()) {
  const item = manifest[key];
  if (!item || seen.has(item.file)) return seen;
  seen.add(item.file);
  for (const imported of item.imports ?? []) closure(imported, seen);
  return seen;
}

const rows = [];
const check = (name, size, budget) => rows.push({ asset: name, gzipKB: +(size / KB).toFixed(1), budgetKB: budget / KB, ok: size <= budget });

// Editor: its page and the chunks nothing else needs count against one editor budget.
const editorFiles = new Set();
if (manifest[EDITOR_PAGE]) {
  const others = new Set(
    Object.keys(manifest)
      .filter((k) => k !== EDITOR_PAGE && (manifest[k].isEntry || manifest[k].isDynamicEntry))
      .flatMap((k) => [...closure(k)]),
  );
  for (const file of closure(EDITOR_PAGE)) {
    const name = file.replace(/^assets\//, '');
    if (!others.has(file) && name !== entry) editorFiles.add(name);
  }
  check(`editor (${editorFiles.size} chunks)`, [...editorFiles].reduce((sum, f) => sum + gz(f), 0), BUDGET.editor);
}

check(`entry ${entry}`, gz(entry), BUDGET.entryJs);
for (const file of files.filter((f) => f.endsWith('.js') && f !== entry && !editorFiles.has(f))) check(file, gz(file), BUDGET.lazyChunk);
check('all CSS', files.filter((f) => f.endsWith('.css')).reduce((sum, f) => sum + gz(f), 0), BUDGET.totalCss);

// Reader pages must never pull in the editor.
const leaks = [];
for (const page of READER_PAGES) {
  if (!manifest[page]) continue;
  for (const file of closure(page)) {
    const name = file.replace(/^assets\//, '');
    if (editorFiles.has(name) || /prosemirror|@tiptap/i.test(readFileSync(join(DIST, file), 'utf8'))) leaks.push(`${page} → ${name}`);
  }
}

const failed = rows.filter((r) => !r.ok);
const biggest = [...rows].sort((a, b) => b.gzipKB - a.gzipKB).slice(0, 6);
console.table(biggest);
if (leaks.length) console.error(`✖ Reader pages load editor code: ${leaks.join(', ')}`);
if (failed.length) console.error(`✖ Over budget: ${failed.map((r) => `${r.asset} (${r.gzipKB} kB > ${r.budgetKB} kB)`).join(', ')}`);
if (failed.length || leaks.length) process.exit(1);
console.log(`✔ Bundle within budget (${rows.length} assets checked; reader pages load no editor code)`);
