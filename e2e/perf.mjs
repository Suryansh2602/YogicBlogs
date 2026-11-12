// Page speed in a real browser (Edge), against the PRODUCTION build of the site and an isolated API on the
// TEST database (:5001). The dev database is never touched. Each page is opened cold (empty cache) twice:
// on this machine's network, and on an emulated mid-range mobile connection (Slow 4G, CPU 4x slower).
import { spawn, execFileSync } from 'node:child_process';
import { join, resolve } from 'node:path';
import { chromium } from 'playwright-core';

const HERE = import.meta.dirname;
const REPO = resolve(HERE, '..');
const API_PORT = Number(process.env.E2E_API_PORT ?? 5001);
const WEB_PORT = Number(process.env.E2E_WEB_PORT ?? 5174);
const WEB = `http://localhost:${WEB_PORT}`;
const OUT = join(HERE, 'perf-dist');
const BACKEND = join(REPO, 'backend');

const dbScript = (code) =>
  execFileSync(process.execPath, ['--env-file=.env.test', '--input-type=module', '-e', code], { cwd: BACKEND, encoding: 'utf8' }).trim();

// 1. One published article in the test database (removed at the end).
const words = 'Slow steady breathing calms the nervous system and eases tension. '.repeat(60).trim();
const seeded = JSON.parse(
  dbScript(`
    const { models, closeDatabase } = await import('./src/config/db.js');
    const tag = Date.now().toString(36);
    const condition = await models.Condition.create({ name: 'Perf ' + tag, slug: 'perf-' + tag, isPublished: true });
    const doc = { type: 'doc', content: [
      { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Why breath helps' }] },
      { type: 'paragraph', content: [{ type: 'text', text: ${JSON.stringify(words)} }] },
      { type: 'callout', attrs: { tone: 'tip' }, content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Morning is best.' }] }] },
      { type: 'verse', attrs: { devanagari: 'योगश्चित्तवृत्तिनिरोधः', transliteration: 'yogaś citta-vṛtti-nirodhaḥ', meaning: 'Yoga is the stilling of the mind.', source: 'Yoga Sutra 1.2' } },
    ] };
    const article = await models.Article.create({ conditionId: condition.id, title: 'Calming the mind in Sharad', slug: 'perf-' + tag,
      summary: 'Simple cooling habits that keep Pitta calm through the bright autumn weeks.', status: 'published', accessLevel: 'public',
      publishedAt: new Date(), contentJson: doc, contentText: ${JSON.stringify(words)}, readingMinutes: 3, liveVersion: 1 });
    console.log(JSON.stringify({ conditionId: condition.id, articleId: article.id, slug: article.slug }));
    await closeDatabase();
  `).split('\n').at(-1),
);

const procs = [];
const start = (cmd, args, cwd, env, ready) =>
  new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { cwd, env: { ...process.env, ...env }, shell: cmd === 'npx' && process.platform === 'win32' });
    let output = '';
    procs.push(child);
    const onData = (chunk) => {
      output += String(chunk);
      if (ready.test(String(chunk))) resolve(child);
    };
    child.stdout.on('data', onData);
    child.stderr.on('data', onData);
    child.on('exit', (code) => reject(new Error(`${args.join(' ')} exited ${code}:\n${output.slice(-1500)}`)));
    setTimeout(() => reject(new Error(`${cmd} did not become ready`)), 120_000);
  });

const results = [];
try {
  // 2. Production build pointed at the test API, served as a real static site would be.
  execFileSync('npx', ['vite', 'build', '--outDir', OUT, '--emptyOutDir', '--logLevel', 'warn'], {
    cwd: join(REPO, 'frontend'),
    env: { ...process.env, VITE_API_BASE_URL: `http://localhost:${API_PORT}/api/v1` },
    shell: true,
    stdio: 'inherit',
  });
  await start(process.execPath, ['--env-file=.env.test', 'src/server.js'], BACKEND, {
    NODE_ENV: 'development', PORT: String(API_PORT), APP_URL: WEB, CLIENT_ORIGIN: WEB, LOG_LEVEL: 'info',
    MAIL_MODE: 'outbox', RECAPTCHA_MODE: 'off', HIBP_ENABLED: 'false', UPLOAD_DIR: join(HERE, 'uploads'),
  }, /API listening/);
  await start('npx', ['vite', 'preview', '--outDir', OUT, '--port', String(WEB_PORT), '--strictPort', '--host', 'localhost'], join(REPO, 'frontend'), {}, /Local/);

  const PAGES = [
    ['Home (today’s ritu, sunrise/sunset)', '/', 'main h1, main h2'],
    ['Ritucharya (English)', '/ritucharya', '.ritu-detail h2'],
    ['Ritucharya (हिन्दी)', '/ritucharya?ritu=sharad&lang=hi', '.ritu-detail h2'],
    ['Articles list', '/articles', 'main h1'],
    ['Article page', `/articles/${seeded.slug}`, 'main h1'],
    ['Home again (warmed up)', '/', 'main h1, main h2'],
  ];
  const PROFILES = [
    ['This machine', null],
    ['Mobile, Slow 4G', { latency: 150, downloadThroughput: (1.6 * 1024 * 1024) / 8, uploadThroughput: (750 * 1024) / 8, cpu: 4 }],
  ];

  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  for (const [profile, net] of PROFILES) {
    for (const [name, path, ready] of PAGES) {
      const context = await browser.newContext({ viewport: net ? { width: 390, height: 844 } : { width: 1366, height: 800 } });
      const page = await context.newPage();
      const cdp = await context.newCDPSession(page);
      if (net) {
        await cdp.send('Network.enable');
        await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: net.latency, downloadThroughput: net.downloadThroughput, uploadThroughput: net.uploadThroughput });
        await cdp.send('Emulation.setCPUThrottlingRate', { rate: net.cpu });
      }
      const errors = [];
      page.on('pageerror', (e) => errors.push(e.message));
      page.on('console', (m) => {
        if (m.type() === 'error') errors.push(m.text());
      });
      await page.addInitScript(() => {
        window.__lcp = 0;
        new PerformanceObserver((list) => {
          for (const e of list.getEntries()) { window.__lcp = e.startTime; window.__lcpEl = e.element ? e.element.tagName + '.' + String(e.element.className).slice(0, 40) + ' «' + (e.element.textContent || '').slice(0, 30) + '»' : '?'; }
        }).observe({ type: 'largest-contentful-paint', buffered: true });
        window.__cls = 0;
        new PerformanceObserver((list) => {
          for (const e of list.getEntries()) if (!e.hadRecentInput) window.__cls += e.value;
        }).observe({ type: 'layout-shift', buffered: true });
      });
      const t0 = Date.now();
      await page.goto(WEB + path, { waitUntil: 'load', timeout: 120_000 });
      await page.locator(ready).first().waitFor({ timeout: 60_000 });
      const contentMs = Date.now() - t0;
      await page.waitForTimeout(1500); // let LCP / layout shifts settle
      const m = await page.evaluate(() => {
        const nav = performance.getEntriesByType('navigation')[0];
        const fcp = performance.getEntriesByName('first-contentful-paint')[0]?.startTime ?? 0;
        const res = performance.getEntriesByType('resource');
        const bytes = res.reduce((n, r) => n + (r.transferSize || 0), nav.transferSize || 0);
        const api = res.filter((r) => r.name.includes('/api/v1/'));
        return {
          fcp: Math.round(fcp),
          lcp: Math.round(window.__lcp),
          cls: +window.__cls.toFixed(3),
          load: Math.round(nav.loadEventEnd),
          kb: Math.round(bytes / 1024),
          requests: res.length + 1,
          apiCalls: api.length,
          apiMs: api.length ? Math.round(Math.max(...api.map((r) => r.duration))) : 0,
          lcpEl: window.__lcpEl,
          editorLoaded: res.some((r) => /AdminArticleEditor|tiptap|prosemirror/i.test(r.name)),
        };
      });
      results.push({ profile, page: name, ...m, contentMs, errors: errors.length });
      console.log(`${profile} | ${name}: LCP-el ${m.lcpEl} | FCP ${m.fcp} ms, LCP ${m.lcp} ms, content ${contentMs} ms, ${m.kb} KB, CLS ${m.cls}${errors.length ? `, ${errors.length} console errors: ${errors[0]}` : ''}`);
      await context.close();
    }
  }
  await browser.close();
  console.table(results);
  console.log('JSON=' + JSON.stringify(results));
} finally {
  for (const p of procs) {
    try {
      if (process.platform === 'win32') execFileSync('taskkill', ['/pid', String(p.pid), '/T', '/F'], { stdio: 'ignore' });
      else p.kill();
    } catch {
      // already gone
    }
  }
  dbScript(`
    const { models, closeDatabase } = await import('./src/config/db.js');
    await models.Article.destroy({ where: { id: '${seeded.articleId}' }, force: true });
    await models.Condition.destroy({ where: { id: '${seeded.conditionId}' }, force: true });
    await closeDatabase();
  `);
  console.log('cleaned up test article');
}

