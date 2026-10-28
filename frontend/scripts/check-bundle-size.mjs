// Performance budget for the production build (run after `vite build`; part of `npm run qa`).
// Fails if the first-load JavaScript, any lazily loaded page, or the CSS grows past its budget, so the
// site can't get slow by accident. Sizes are gzipped, as they travel over the network.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';

const ASSETS = 'dist/assets';
const KB = 1024;
const BUDGET = {
  entryJs: 115 * KB, // React + router + app shell (React alone is ~60 kB of this)
  lazyChunk: 25 * KB, // any single page loaded on demand
  totalCss: 16 * KB,
};

const gz = (file) => gzipSync(readFileSync(join(ASSETS, file))).length;
const files = readdirSync(ASSETS);
const html = readFileSync('dist/index.html', 'utf8');
const entry = /src="\/assets\/([^"]+\.js)"/.exec(html)?.[1];
if (!entry) throw new Error('Could not find the entry script in dist/index.html');

const rows = [];
const check = (name, size, budget) => rows.push({ asset: name, gzipKB: +(size / KB).toFixed(1), budgetKB: budget / KB, ok: size <= budget });

check(`entry ${entry}`, gz(entry), BUDGET.entryJs);
for (const file of files.filter((f) => f.endsWith('.js') && f !== entry)) check(file, gz(file), BUDGET.lazyChunk);
check('all CSS', files.filter((f) => f.endsWith('.css')).reduce((sum, f) => sum + gz(f), 0), BUDGET.totalCss);

const failed = rows.filter((r) => !r.ok);
const biggest = [...rows].sort((a, b) => b.gzipKB - a.gzipKB).slice(0, 6);
console.table(biggest);
if (failed.length) {
  console.error(`✖ Over budget: ${failed.map((r) => `${r.asset} (${r.gzipKB} kB > ${r.budgetKB} kB)`).join(', ')}`);
  process.exit(1);
}
console.log(`✔ Bundle within budget (${rows.length} assets checked)`);
