// Renders the default link-preview image (1200x630) and the phone icon (180x180) with the site's own fonts.
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { chromium } from 'playwright-core';

const FRONT = resolve(import.meta.dirname, '..', 'frontend');
const mark = readFileSync(join(FRONT, 'public/healthmarg-mark.svg'), 'utf8');
const font = (path) => readFileSync(join(FRONT, 'node_modules', path)).toString('base64');
const fraunces = font('@fontsource-variable/fraunces/files/fraunces-latin-wght-normal.woff2');
const sans = font('@fontsource-variable/dm-sans/files/dm-sans-latin-wght-normal.woff2');

const css = `
  @font-face { font-family: Fraunces; src: url(data:font/woff2;base64,${fraunces}); font-weight: 100 900; }
  @font-face { font-family: 'DM Sans'; src: url(data:font/woff2;base64,${sans}); font-weight: 100 1000; }
  * { box-sizing: border-box; margin: 0; }
  body { background: #fbf6ef; }
`;

const og = `<!doctype html><style>${css}
  .card { width: 1200px; height: 630px; padding: 90px 96px; display: flex; flex-direction: column; justify-content: center; gap: 30px; border-bottom: 10px solid #127a71; }
  .brand { display: flex; align-items: center; gap: 22px; font: 600 42px Fraunces, serif; color: #1f2a5a; }
  .brand svg { width: 76px; height: 76px; }
  h1 { font: 600 76px/1.08 Fraunces, serif; color: #1f2a5a; max-width: 980px; }
  p { font: 400 32px 'DM Sans', sans-serif; color: #5a5f73; }
</style><div class="card"><div class="brand">${mark}<span>Healthmarg</span></div><h1>Yoga and Ayurveda for everyday health</h1><p>Classical wisdom, clearly explained</p></div>`;

const icon = `<!doctype html><style>${css} .i { width: 180px; height: 180px; display: grid; place-items: center; background: #fbf6ef; } .i svg { width: 140px; height: 140px; }</style><div class="i">${mark}</div>`;

const browser = await chromium.launch({ channel: 'msedge', headless: true });
for (const [html, width, height, out] of [
  [og, 1200, 630, 'public/og-default.png'],
  [icon, 180, 180, 'public/apple-touch-icon.png'],
]) {
  const page = await browser.newPage({ viewport: { width, height } });
  await page.setContent(html);
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(300);
  await page.screenshot({ path: join(FRONT, out) });
  console.log('wrote', out);
}
process.exit(0);
