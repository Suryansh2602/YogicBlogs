// Diagnosis for page speed: on Slow 4G, every file a page loads, when it started and finished, its size on
// the wire and whether it was compressed, plus first paint, the LCP element and when it painted.
// Same setup as perf.mjs (production build, test API on :5001, test database). SERVE=compressed puts a
// small gzip/brotli static server in front of the build instead of vite preview, like a real host.
import { spawn, execFileSync } from 'node:child_process';
import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize, resolve } from 'node:path';
import { pipeline } from 'node:stream';
import { createBrotliCompress, createGzip, constants as zlib } from 'node:zlib';
import { chromium } from 'playwright-core';

const HERE = import.meta.dirname;
const REPO = resolve(HERE, '..');
const API_PORT = Number(process.env.E2E_API_PORT ?? 5001);
const WEB_PORT = Number(process.env.E2E_WEB_PORT ?? 5174);
const WEB = `http://localhost:${WEB_PORT}`;
const OUT = join(HERE, 'perf-dist');
const BACKEND = join(REPO, 'backend');
const SERVE = process.env.SERVE ?? 'preview';
const SKIP_BUILD = process.env.SKIP_BUILD === '1';

const dbScript = (code) =>
  execFileSync(process.execPath, ['--env-file=.env.test', '--input-type=module', '-e', code], { cwd: BACKEND, encoding: 'utf8' }).trim();

const words = 'Slow steady breathing calms the nervous system and eases tension. '.repeat(60).trim();
const seeded = JSON.parse(
  dbScript(`
    const { models, closeDatabase } = await import('./src/config/db.js');
    const tag = Date.now().toString(36);
    const condition = await models.Condition.create({ name: 'Diag ' + tag, slug: 'diag-' + tag, isPublished: true });
    const doc = { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: ${JSON.stringify(words)} }] }] };
    const article = await models.Article.create({ conditionId: condition.id, title: 'Calming the mind in Sharad', slug: 'diag-' + tag,
      summary: 'Simple cooling habits.', status: 'published', accessLevel: 'public',
      publishedAt: new Date(), contentJson: doc, contentText: ${JSON.stringify(words)}, readingMinutes: 3, liveVersion: 1 });
    console.log(JSON.stringify({ conditionId: condition.id, articleId: article.id, slug: article.slug }));
    await closeDatabase();
  `).split('\n').at(-1),
);

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2', '.json': 'application/json', '.txt': 'text/plain' };
const COMPRESSIBLE = new Set(['.html', '.js', '.css', '.svg', '.json', '.txt']);

/** A static server like a real host: long cache for hashed assets, SPA fallback, brotli or gzip. */
function compressedServer() {
  return createServer((req, res) => {
    const url = new URL(req.url, WEB);
    let file = normalize(join(OUT, decodeURIComponent(url.pathname)));
    if (!file.startsWith(normalize(OUT))) return res.writeHead(403).end();
    if (!existsSync(file) || statSync(file).isDirectory()) {
      const index = join(file, 'index.html');
      file = existsSync(index) ? index : join(OUT, 'index.html');
    }
    const ext = extname(file);
    res.setHeader('Content-Type', TYPES[ext] ?? 'application/octet-stream');
    res.setHeader('Cache-Control', url.pathname.startsWith('/assets/') ? 'public, max-age=31536000, immutable' : 'no-cache');
    const accepts = String(req.headers['accept-encoding'] ?? '');
    if (COMPRESSIBLE.has(ext) && /\bbr\b/.test(accepts)) {
      res.setHeader('Content-Encoding', 'br');
      return pipeline(createReadStream(file), createBrotliCompress({ params: { [zlib.BROTLI_PARAM_QUALITY]: 5 } }), res, () => {});
    }
    if (COMPRESSIBLE.has(ext) && /\bgzip\b/.test(accepts)) {
      res.setHeader('Content-Encoding', 'gzip');
      return pipeline(createReadStream(file), createGzip(), res, () => {});
    }
    createReadStream(file).pipe(res);
  });
}

const procs = [];
let staticServer;
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

try {
  if (!SKIP_BUILD) {
    execFileSync('npx', ['vite', 'build', '--outDir', OUT, '--emptyOutDir', '--logLevel', 'warn'], {
      cwd: join(REPO, 'frontend'),
      env: { ...process.env, VITE_API_BASE_URL: `http://localhost:${API_PORT}/api/v1` },
      shell: true,
      stdio: 'inherit',
    });
  }
  await start(process.execPath, ['--env-file=.env.test', 'src/server.js'], BACKEND, {
    NODE_ENV: 'development', PORT: String(API_PORT), APP_URL: WEB, CLIENT_ORIGIN: WEB, LOG_LEVEL: 'info',
    MAIL_MODE: 'outbox', RECAPTCHA_MODE: 'off', HIBP_ENABLED: 'false', UPLOAD_DIR: join(HERE, 'uploads'),
  }, /API listening/);
  if (SERVE === 'compressed') {
    staticServer = compressedServer();
    await new Promise((resolve) => staticServer.listen(WEB_PORT, 'localhost', resolve));
  } else {
    await start('npx', ['vite', 'preview', '--outDir', OUT, '--port', String(WEB_PORT), '--strictPort', '--host', 'localhost'], join(REPO, 'frontend'), {}, /Local/);
  }
  console.log(`serving: ${SERVE}`);

  const PAGES = [
    ['Home', '/'],
    ['Ritucharya', '/ritucharya'],
    ['Article', `/articles/${seeded.slug}`],
  ];
  const net = { latency: 150, downloadThroughput: (1.6 * 1024 * 1024) / 8, uploadThroughput: (750 * 1024) / 8, cpu: 4 };
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  for (const [name, path] of PAGES.filter(([n]) => !process.env.ONLY || process.env.ONLY.split(',').includes(n))) {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const page = await context.newPage();
    const cdp = await context.newCDPSession(page);
    await cdp.send('Network.enable');
    await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: net.latency, downloadThroughput: net.downloadThroughput, uploadThroughput: net.uploadThroughput });
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: net.cpu });
    // Experiments: EXPERIMENT=arial forces one plain system font; EXPERIMENT=nowebfonts blocks the .woff2 files.
    if (process.env.EXPERIMENT === 'arial') {
      await page.addInitScript(() => {
        const s = document.createElement('style');
        s.textContent = '*, *::before, *::after { font-family: Arial, sans-serif !important; }';
        document.documentElement.appendChild(s);
      });
    }
    if (process.env.EXPERIMENT === 'nodeva') {
      // Swap every Devanagari letter for "a" as soon as it reaches the page (measurement only).
      await page.addInitScript(() => {
        const DEVA = /[ऀ-ॿ꣠-ꣿ]/g;
        const clean = (node) => {
          if (node.nodeType === 3) { if (DEVA.test(node.data)) node.data = node.data.replace(DEVA, 'a'); return; }
          const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT);
          for (let t = walker.nextNode(); t; t = walker.nextNode()) if (DEVA.test(t.data)) t.data = t.data.replace(DEVA, 'a');
        };
        new MutationObserver((list) => {
          for (const m of list) {
            if (m.type === 'characterData') clean(m.target);
            for (const n of m.addedNodes) clean(n);
          }
        }).observe(document, { subtree: true, childList: true, characterData: true });
      });
    }
    if (process.env.EXTRA_CSS) {
      await page.addInitScript((css) => {
        const s = document.createElement('style');
        s.textContent = css;
        document.documentElement.appendChild(s);
      }, process.env.EXTRA_CSS);
    }
    if (process.env.EXPERIMENT === 'nowebfonts') await page.route(/\.woff2$/, (r) => r.abort());
    const encodings = new Map();
    page.on('response', (r) => encodings.set(r.url(), r.headers()['content-encoding'] ?? '-'));
    const consoleProblems = [];
    page.on('console', (m) => {
      if (m.type() === 'error' || m.type() === 'warning') consoleProblems.push(`${m.type()}: ${m.text().slice(0, 160)}`);
    });
    page.on('pageerror', (e) => consoleProblems.push(`pageerror: ${e.message.slice(0, 160)}`));
    await page.addInitScript(() => {
      window.__lcp = [];
      new PerformanceObserver((list) => {
        for (const e of list.getEntries()) {
          window.__lcp.push({ t: Math.round(e.startTime), render: Math.round(e.renderTime), load: Math.round(e.loadTime), size: e.size, el: e.element ? `${e.element.tagName}.${String(e.element.className).slice(0, 30)} «${(e.element.textContent || '').slice(0, 30)}»` : '?' });
        }
      }).observe({ type: 'largest-contentful-paint', buffered: true });
    });
    const tracing = process.env.TRACE === '1';
    if (tracing) await browser.startTracing(page, { categories: ['devtools.timeline', 'v8.execute', 'disabled-by-default-devtools.timeline', 'loading', 'blink.user_timing'] });
    const profiling = process.env.PROFILE === '1';
    if (profiling) {
      await cdp.send('Profiler.enable');
      await cdp.send('Profiler.setSamplingInterval', { interval: 200 });
      await cdp.send('Profiler.start');
    }
    await page.goto(WEB + path, { waitUntil: 'load', timeout: 120_000 });
    await page.waitForTimeout(3000);
    if (tracing) {
      // Main-thread work before first paint, by kind: top-level tasks only (children are inside them).
      const trace = JSON.parse(String(await browser.stopTracing()));
      const events = trace.traceEvents;
      const nav = events.find((e) => e.name === 'navigationStart' && e.args?.data?.isLoadingMainFrame && e.args.data.documentLoaderURL?.startsWith(WEB));
      const fcpEv = events.find((e) => e.name === 'firstContentfulPaint');
      const mainTid = events.find((e) => e.name === 'thread_name' && e.args?.name === 'CrRendererMain' && e.pid === fcpEv?.pid)?.tid;
      const t0 = nav?.ts ?? 0;
      const fcpAt = fcpEv ? (fcpEv.ts - t0) / 1000 : Infinity;
      const kinds = ['EvaluateScript', 'v8.compile', 'v8.compileModule', 'v8.evaluateModule', 'FunctionCall', 'TimerFire', 'EventDispatch', 'ParseHTML', 'ParseAuthorStyleSheet', 'UpdateLayoutTree', 'RecalculateStyles', 'Layout', 'PrePaint', 'Paint', 'Layerize', 'UpdateLayer', 'CompositeLayers', 'Commit', 'RunMicrotasks', 'v8.run', 'FireAnimationFrame', 'HitTest', 'ScheduleStyleRecalculation', 'MajorGC', 'MinorGC', 'V8.GC_SCAVENGER', 'ResourceReceivedData'];
      const sums = new Map();
      let busy = 0;
      for (const e of events) {
        if (e.tid !== mainTid || e.pid !== fcpEv?.pid || e.ph !== 'X' || !e.dur) continue;
        const start = (e.ts - t0) / 1000;
        if (start < 0 || start > fcpAt) continue;
        const ms = Math.min(e.dur / 1000, fcpAt - start);
        if (e.name === 'RunTask') busy += ms;
        if (kinds.includes(e.name)) sums.set(e.name, (sums.get(e.name) ?? 0) + ms);
      }
      console.log(`\n--- ${name}: main thread before first paint (${fcpAt.toFixed(0)} ms): busy ${busy.toFixed(0)} ms`);
      for (const [k, ms] of [...sums].sort((a, b) => b[1] - a[1])) if (ms >= 5) console.log(`  ${ms.toFixed(0).padStart(6)} ms  ${k}`);
      // The longest single tasks before first paint, with what they mostly did.
      const tasks = events.filter((e) => e.tid === mainTid && e.pid === fcpEv?.pid && e.name === 'RunTask' && e.dur > 50_000 && (e.ts - t0) / 1000 < fcpAt);
      for (const task of tasks.sort((a, b) => b.dur - a.dur).slice(0, 6)) {
        const inside = events.filter((e) => e.tid === mainTid && e.ph === 'X' && e.ts >= task.ts && e.ts + (e.dur ?? 0) <= task.ts + task.dur && kinds.includes(e.name));
        const top = new Map();
        for (const e of inside) top.set(e.name, (top.get(e.name) ?? 0) + e.dur / 1000);
        const url = inside.find((e) => e.args?.data?.url)?.args.data.url?.replace(/^.*\//, '') ?? '';
        console.log(`  task at ${((task.ts - t0) / 1000).toFixed(0)} ms, ${(task.dur / 1000).toFixed(0)} ms: ${[...top].sort((a, b) => b[1] - a[1]).slice(0, 4).map(([k, v]) => `${k} ${v.toFixed(0)}`).join(', ')} ${url}`);
      }
    }
    if (profiling) {
      // Self time per function (where the CPU actually was), summed; then per file.
      const { profile } = await cdp.send('Profiler.stop');
      const byId = new Map(profile.nodes.map((n) => [n.id, n]));
      const self = new Map();
      const dt = profile.timeDeltas;
      profile.samples.forEach((id, i) => {
        const n = byId.get(id);
        const f = n.callFrame;
        const key = `${f.functionName || '(anonymous)'}  ${f.url.replace(/^.*\//, '')}:${f.lineNumber + 1}:${f.columnNumber + 1}`;
        self.set(key, (self.get(key) ?? 0) + (dt[i] ?? 0) / 1000);
      });
      const top = [...self].filter(([k]) => !/^\((idle|program|garbage collector)\)/.test(k)).sort((a, b) => b[1] - a[1]).slice(0, 25);
      console.log(`\n--- ${name}: top functions by self time (ms, CPU slowed 4x)`);
      for (const [k, ms] of top) console.log(`  ${ms.toFixed(1).padStart(7)}  ${k}`);
      const special = [...self].filter(([k]) => /^\((idle|program|garbage collector)\)/.test(k)).map(([k, v]) => `${k.split('  ')[0]} ${v.toFixed(0)}`);
      console.log(`  other: ${special.join(', ')}`);
    }
    const m = await page.evaluate(() => {
      const nav = performance.getEntriesByType('navigation')[0];
      const fcp = performance.getEntriesByName('first-contentful-paint')[0]?.startTime ?? 0;
      const res = performance.getEntriesByType('resource').map((r) => ({
        name: r.name.replace(location.origin, '').replace(/^http:\/\/localhost:5001/, 'API '),
        type: r.initiatorType, start: Math.round(r.startTime), end: Math.round(r.responseEnd), kb: +(r.transferSize / 1024).toFixed(1), rawKb: +(r.decodedBodySize / 1024).toFixed(1),
      }));
      return { htmlEnd: Math.round(nav.responseEnd), domContentLoaded: Math.round(nav.domContentLoadedEventEnd), fcp: Math.round(fcp), lcp: window.__lcp, res, fonts: [...document.fonts].filter((f) => f.status === 'loaded').map((f) => f.family + ' ' + f.weight) };
    });
    console.log(`\n=== ${name}  html done ${m.htmlEnd} ms · DOMContentLoaded ${m.domContentLoaded} ms · FCP ${m.fcp} ms`);
    for (const r of m.res.sort((a, b) => a.start - b.start)) {
      const enc = encodings.get(r.name.startsWith('API ') ? r.name.replace('API ', 'http://localhost:5001') : WEB + r.name) ?? '?';
      console.log(`  ${String(r.start).padStart(5)} → ${String(r.end).padStart(5)} ms  ${String(r.kb).padStart(6)} KB wire / ${String(r.rawKb).padStart(6)} KB raw  ${enc.padEnd(5)} ${r.type.padEnd(6)} ${r.name.slice(0, 70)}`);
    }
    for (const e of m.lcp) console.log(`  LCP candidate at ${e.t} ms (size ${e.size}): ${e.el}`);
    console.log(`  fonts used: ${m.fonts.join(', ')}`);
    console.log(`  hydrated prerendered page: ${await page.evaluate(() => document.getElementById('root')?.dataset.prerendered ?? 'no (built in the browser)')}`);
    console.log(`  console problems: ${consoleProblems.length ? consoleProblems.join(' | ') : 'none'}`);
    await context.close();
  }
  await browser.close();
} finally {
  staticServer?.close();
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
}
