// SEO end to end: production build, the real API on the TEST database, and a small server that routes
// addresses as the production proxy will. Checks raw HTML (what crawlers get) and real Edge (what readers get).
import { spawn, execFileSync } from 'node:child_process';
import { createServer, request as httpRequest } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, resolve } from 'node:path';
import { chromium } from 'playwright-core';

const HERE = import.meta.dirname;
const REPO = resolve(HERE, '..');
const API_PORT = Number(process.env.E2E_API_PORT ?? 5001);
const WEB_PORT = Number(process.env.E2E_WEB_PORT ?? 5174);
const WEB = `http://localhost:${WEB_PORT}`;
const API = `http://localhost:${API_PORT}`;
const OUT = join(HERE, 'seo-dist');
const BACKEND = join(REPO, 'backend');
const SITE = 'https://healthmarg.example';
const CSP = `default-src 'self'; connect-src 'self' ${API}; img-src 'self' data: ${API}; style-src 'self' 'unsafe-inline'; font-src 'self' data:`;

const results = [];
const check = (name, ok, detail = '') => {
  results.push(ok);
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  → ${detail}`}`);
};

const dbScript = (code) => execFileSync(process.execPath, ['--env-file=.env.test', '--input-type=module', '-e', code], { cwd: BACKEND, encoding: 'utf8' }).trim();

const seeded = JSON.parse(
  dbScript(`
    const { models, closeDatabase } = await import('./src/config/db.js');
    const tag = Date.now().toString(36);
    const condition = await models.Condition.create({ name: 'Seo ' + tag, slug: 'seo-' + tag, isPublished: true });
    const doc = { type: 'doc', content: [
      { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Why breath helps' }] },
      { type: 'paragraph', content: [{ type: 'text', text: 'Slow steady breathing eases tension.' }] } ] };
    const make = (slug, accessLevel, title) => models.Article.create({ conditionId: condition.id, title, slug, summary: 'A short summary for the card.', status: 'published', accessLevel,
      publishedAt: new Date(), contentJson: doc, contentText: 'Slow steady breathing eases tension.', readingMinutes: 1, liveVersion: 1 });
    const open = await make('seo-open-' + tag, 'public', 'Calm breath </title><script>alert(1)</script>');
    const members = await make('seo-members-' + tag, 'members', 'Members breath');
    console.log(JSON.stringify({ conditionId: condition.id, ids: [open.id, members.id], open: open.slug, members: members.slug }));
    await closeDatabase();
  `).split('\n').at(-1),
);

const procs = [];
const start = (cmd, args, cwd, env, ready) =>
  new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { cwd, env: { ...process.env, ...env } });
    let output = '';
    procs.push(child);
    const onData = (chunk) => {
      output += String(chunk);
      if (ready.test(String(chunk))) resolve(child);
    };
    child.stdout.on('data', onData);
    child.stderr.on('data', onData);
    child.on('exit', (code) => reject(new Error(`exited ${code}:\n${output.slice(-1500)}`)));
    setTimeout(() => reject(new Error('API did not become ready')), 60_000);
  });

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2', '.txt': 'text/plain' };

/** Routes as the production proxy: /sitemap.xml and /articles/<slug> to the API, the rest static with SPA fallback. */
const web = createServer(async (req, res) => {
  const path = new URL(req.url, WEB).pathname;
  if (/^\/(sitemap\.xml$|articles\/.+)/.test(path)) {
    const upstream = httpRequest({ port: API_PORT, path: req.url, method: req.method, headers: req.headers }, (answer) => {
      res.writeHead(answer.statusCode, answer.headers);
      answer.pipe(res);
    });
    upstream.on('error', () => res.writeHead(502).end());
    req.pipe(upstream);
    return;
  }
  const candidates = [join(OUT, path), join(OUT, path, 'index.html'), join(OUT, 'index.html')];
  for (const file of candidates) {
    const info = await stat(file).catch(() => null);
    if (info?.isFile()) {
      res.writeHead(200, { 'Content-Type': TYPES[extname(file)] ?? 'application/octet-stream', 'Content-Security-Policy': CSP });
      res.end(await readFile(file));
      return;
    }
  }
  res.writeHead(404).end();
});

try {
  execFileSync(process.platform === 'win32' ? 'npx.cmd' : 'npx', ['vite', 'build', '--outDir', OUT, '--emptyOutDir', '--logLevel', 'warn'], {
    cwd: join(REPO, 'frontend'),
    env: { ...process.env, VITE_API_BASE_URL: `${API}/api/v1`, VITE_SITE_URL: SITE },
    shell: true,
    stdio: 'inherit',
  });
  await start(process.execPath, ['--env-file=.env.test', 'src/server.js'], BACKEND, {
    NODE_ENV: 'development', PORT: String(API_PORT), APP_URL: SITE, CLIENT_ORIGIN: WEB, LOG_LEVEL: 'info', MAIL_MODE: 'outbox', RECAPTCHA_MODE: 'off', HIBP_ENABLED: 'false',
    SITE_INDEX_HTML: join(OUT, 'index.html'), SITE_CSP: CSP, SITE_API_URL: API,
  }, /API listening/);
  await new Promise((resolve) => web.listen(WEB_PORT, 'localhost', resolve));

  // ── What crawlers get ─────────────────────────────────────────────────────────────
  const get = async (path) => {
    const res = await fetch(WEB + path, { redirect: 'manual' });
    return { status: res.status, text: await res.text(), headers: res.headers };
  };
  const sitemap = await get('/sitemap.xml');
  check('sitemap answers from the real database', sitemap.status === 200 && sitemap.text.includes(`${SITE}/articles/${seeded.open}</loc><lastmod>`), sitemap.text.slice(0, 300));
  check('sitemap lists the members article and each season', sitemap.text.includes(seeded.members) && sitemap.text.includes('ritu=hemanta&amp;lang=hi'));
  const robots = await get('/robots.txt');
  check('robots.txt allows crawling and names the sitemap', robots.text.includes('Allow: /') && robots.text.includes(`Sitemap: ${SITE}/sitemap.xml`), robots.text);

  const ritu = await get('/ritucharya');
  check('Ritucharya raw HTML has its own title and canonical', ritu.text.includes('<title>Ritucharya: living by the six seasons · Healthmarg</title>') && ritu.text.includes(`href="${SITE}/ritucharya"`));
  const home = await get('/');
  check('home raw HTML has a full preview image address', home.text.includes(`content="${SITE}/og-default.png"`));
  check('home raw HTML names no canonical (it is also the fallback page)', !home.text.includes('rel="canonical"'));

  const open = await get(`/articles/${seeded.open}`);
  check('article answers 200 with its text in the raw HTML', open.status === 200 && open.text.includes('Slow steady breathing eases tension.'), String(open.status));
  check('hostile title stays plain text', !open.text.includes('<script>alert(1)') && (open.text.match(/<\/title>/g) ?? []).length === 1);
  check('article raw HTML has canonical and JSON-LD', open.text.includes(`rel="canonical" href="${SITE}/articles/${seeded.open}"`) && open.text.includes('"@type":"Article"'));
  check('article page carries the site CSP', open.headers.get('content-security-policy') === CSP);

  const members = await get(`/articles/${seeded.members}`);
  check('members article never sends its body', members.status === 200 && !members.text.includes('Slow steady breathing') && members.text.includes('"isAccessibleForFree":false'));

  const missing = await get('/articles/no-such-article-here');
  check('missing article answers a real 404 with noindex', missing.status === 404 && missing.text.includes('name="robots" content="noindex"'), String(missing.status));

  // Prerendered pages (docs/page-speed.md)
  check('Ritucharya raw HTML carries its text, marked as built for /ritucharya', ritu.text.includes('Ayurveda divides the year into six ritus') && ritu.text.includes('data-prerendered="/ritucharya"') && ritu.text.includes('name="hm-prerendered" content="/ritucharya"'));
  check('Ritucharya raw HTML links its own code and CSS, and preloads the main fonts', /rel="modulepreload" crossorigin href="\/assets\/RitucharyaPage-/.test(ritu.text) && /rel="stylesheet" crossorigin href="\/assets\/RitucharyaPage-/.test(ritu.text) && (ritu.text.match(/rel="preload" as="font"/g) ?? []).length === 2);
  check('home raw HTML carries its text, with no inline script or style', home.text.includes('Ancient wisdom for') && !/<script>/.test(home.text) && !/\sstyle="/.test(home.text));
  check('article raw HTML starts empty: none of Home’s text, no path marker', open.text.includes('<div id="root"></div><noscript>') && !open.text.includes('Ancient wisdom') && !open.text.includes('hm-prerendered'));
  const about = await get('/about');
  check('About raw HTML carries its text and registration details, marked as built for /about', about.text.includes('Where our guidance comes from') && about.text.includes('23AEYPU5249R1Z7') && about.text.includes('data-prerendered="/about"') && about.text.includes('href="https://wa.me/918982579178?text='));
  check('sitemap lists the About page in English and Hindi', sitemap.text.includes(`<loc>${SITE}/about</loc>`) && sitemap.text.includes(`<loc>${SITE}/about?lang=hi</loc>`));
  const shell = await get('/app.html');
  check('app.html is an empty page for hosts that can use it as their fallback', shell.status === 200 && shell.text.includes('<div id="root"></div>') && !shell.text.includes('hm-prerendered'));

  // ── What readers get ──────────────────────────────────────────────────────────────
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const context = await browser.newContext({ viewport: { width: 1366, height: 900 } });
  const page = await context.newPage();
  const errors = [];
  page.on('console', (m) => {
    if (m.type() === 'error' && !/status of 40[13]/.test(m.text())) errors.push(m.text());
  });
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  const tags = () =>
    page.evaluate(() => ({
      titles: document.querySelectorAll('title').length,
      title: document.title,
      lang: document.documentElement.lang,
      canonical: [...document.querySelectorAll('link[rel=canonical]')].map((l) => l.getAttribute('href')),
      descriptions: document.querySelectorAll('meta[name=description]').length,
      ogTitles: document.querySelectorAll('meta[property="og:title"]').length,
      jsonLd: document.querySelectorAll('script[type="application/ld+json"]').length,
      robots: document.querySelector('meta[name=robots]')?.content ?? null,
      h1: document.querySelectorAll('h1').length,
    }));

  await page.goto(`${WEB}/articles/${seeded.open}`, { waitUntil: 'load' });
  await page.getByRole('heading', { level: 2, name: 'Why breath helps' }).waitFor({ timeout: 15000 });
  let t = await tags();
  check('article in Edge: the app takes over with one of every tag', t.titles === 1 && t.canonical.length === 1 && t.descriptions === 1 && t.ogTitles === 1 && t.jsonLd === 1, JSON.stringify(t));
  check('article in Edge: exactly one h1', t.h1 === 1, String(t.h1));

  await page.getByRole('link', { name: 'Ritucharya' }).first().click();
  await page.getByRole('heading', { level: 1 }).first().waitFor();
  await page.waitForTimeout(400);
  t = await tags();
  check('moving to Ritucharya updates the tags and clears article data', t.title.startsWith('Ritucharya') && t.canonical[0] === `${SITE}/ritucharya` && t.jsonLd === 0, JSON.stringify(t));

  await page.goto(`${WEB}/ritucharya?ritu=vasanta&lang=hi`, { waitUntil: 'load' });
  await page.waitForTimeout(600);
  t = await tags();
  check('Hindi season: Hindi title and page language', t.lang === 'hi' && t.title.includes('वसन्त') && t.canonical[0].includes('lang=hi'), JSON.stringify(t));

  await page.goto(`${WEB}/signin`, { waitUntil: 'load' });
  await page.waitForTimeout(600);
  t = await tags();
  check('sign-in page is noindex, with no canonical', t.robots === 'noindex' && t.canonical.length === 0, JSON.stringify(t));

  await page.goto(`${WEB}/admin`, { waitUntil: 'load' });
  await page.waitForTimeout(600);
  t = await tags();
  check('admin page is noindex', t.robots === 'noindex', JSON.stringify(t));

  await page.goto(`${WEB}/`, { waitUntil: 'load' });
  await page.waitForTimeout(600);
  t = await tags();
  check('home has one h1, and Organization + WebSite data', t.h1 === 1 && t.jsonLd === 1 && t.robots === null, JSON.stringify(t));

  await page.goto(`${WEB}/no/such/page`, { waitUntil: 'load' });
  await page.waitForTimeout(600);
  t = await tags();
  check('unknown address is noindex', t.robots === 'noindex', JSON.stringify(t));

  // React must take the prerendered HTML over, not rebuild it: the heading parsed from the HTML (before any
  // script ran) is still the same element once the page has settled.
  const fresh = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const kept = await fresh.newPage();
  kept.on('console', (m) => {
    if (m.type() === 'error' && !/status of 40[13]/.test(m.text())) errors.push(m.text());
  });
  kept.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  await kept.addInitScript(() => {
    document.addEventListener('readystatechange', () => {
      if (document.readyState === 'interactive') window.__parsedH1 = document.querySelector('main h1');
    });
  });
  for (const path of ['/', '/ritucharya', '/about', '/articles', '/terms']) {
    await kept.goto(`${WEB}${path}`, { waitUntil: 'load' });
    await kept.waitForTimeout(1500);
    const state = await kept.evaluate(() => ({
      parsed: Boolean(window.__parsedH1),
      same: window.__parsedH1 === document.querySelector('main h1'),
      marker: document.getElementById('root')?.dataset.prerendered ?? null,
      spinner: Boolean(document.querySelector('.page-loader')),
    }));
    check(`${path} in Edge: React takes the prerendered page over without rebuilding it`, state.parsed && state.same && state.marker === path && !state.spinner, JSON.stringify(state));
  }
  await kept.goto(`${WEB}/signin`, { waitUntil: 'load' });
  await kept.getByRole('heading', { name: 'Welcome back' }).waitFor({ timeout: 15000 });
  check('/signin (served Home’s file) shows the sign-in page and none of Home’s text', !(await kept.locator('body').innerText()).includes('Ancient wisdom for'));
  await fresh.close();

  const noJs = await browser.newContext({ javaScriptEnabled: false });
  const plain = await noJs.newPage();
  await plain.goto(`${WEB}/articles/${seeded.open}`, { waitUntil: 'load' });
  check('with JavaScript off, the article can still be read', (await plain.locator('body').innerText()).includes('Slow steady breathing eases tension.'));
  await plain.goto(`${WEB}/`, { waitUntil: 'load' });
  check('with JavaScript off, Home shows its text', (await plain.locator('main').innerText()).includes('Understand the causes of everyday conditions'));
  await plain.goto(`${WEB}/ritucharya`, { waitUntil: 'load' });
  check('with JavaScript off, Ritucharya shows its text and the current season', (await plain.locator('main').innerText()).includes('Ayurveda divides the year into six ritus') && (await plain.locator('[role=tabpanel]').count()) === 1);

  check('no console or CSP errors', errors.length === 0, [...new Set(errors)].join(' | '));
} catch (err) {
  check('run finished', false, err.stack);
} finally {
  web.close();
  for (const p of procs) {
    try {
      execFileSync('taskkill', ['/pid', String(p.pid), '/T', '/F'], { stdio: 'ignore' });
    } catch {
      // already gone
    }
  }
  dbScript(`
    const { models, closeDatabase } = await import('./src/config/db.js');
    await models.Article.destroy({ where: { id: ${JSON.stringify(seeded.ids)} }, force: true });
    await models.Condition.destroy({ where: { id: '${seeded.conditionId}' }, force: true });
    await closeDatabase();
  `);
  console.log('cleaned up test articles');
  const failed = results.filter((ok) => !ok).length;
  console.log(`${results.length - failed} of ${results.length} checks passed`);
  process.exit(failed ? 1 : 0);
}
