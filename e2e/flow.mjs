// Real-browser end-to-end run against an isolated copy of the app on the TEST database:
//   API :5001 (healthmarg_test, known setup code), site :5174. The dev database is never touched.
import { spawn, execFileSync } from 'node:child_process';
import { readdirSync, readFileSync, mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { createRequire } from 'node:module';
import { chromium } from 'playwright-core';

const HERE = import.meta.dirname;
const REPO = resolve(HERE, '..');
const API_PORT = Number(process.env.E2E_API_PORT ?? 5001);
const WEB_PORT = Number(process.env.E2E_WEB_PORT ?? 5174);
const WEB = `http://localhost:${WEB_PORT}`;
const SETUP_CODE = 'e2e-only-setup-code-0123456789';
const OUTBOX = join(REPO, 'backend/.local/outbox');
const OTPAuth = createRequire(join(REPO, 'backend/package.json'))('otpauth');
const totp = (secret) => new OTPAuth.TOTP({ secret: OTPAuth.Secret.fromBase32(secret.replace(/\s/g, '')), digits: 6, period: 30 }).generate();
mkdirSync('shots', { recursive: true });

const steps = [];
const errors = [];
const t0 = Date.now();
const step = (name, ok = true, note = '') => {
  steps.push({ step: name, result: ok ? 'PASS' : 'FAIL', note });
  console.log(`${((Date.now() - t0) / 1000).toFixed(1)}s ${ok ? 'PASS' : 'FAIL'} ${name}${note ? ` (${note})` : ''}`);
};

// 1. Fresh test database (the migrator user may empty tables; the app user may not).
execFileSync(
  process.execPath,
  ['--env-file=.env.test', '--input-type=module', '-e', "const h = await import('./tests/db/helpers.js'); const m = h.connectAsMigrator(); await h.resetTables(m); await m.close();"],
  { cwd: join(REPO, 'backend'), stdio: 'inherit' },
);
step('test database reset');

// 2. Isolated API + site.
const procs = [];
/** Stops the API and site. Runs on every exit, including a crash before the main run (Edge failing to start). */
const stopServers = () => {
  for (const p of procs.splice(0)) {
    try {
      if (process.platform === 'win32') execFileSync('taskkill', ['/pid', String(p.pid), '/T', '/F'], { stdio: 'ignore' });
      else p.kill();
    } catch {
      // already gone
    }
  }
};
process.on('exit', stopServers);
const start = (cmd, args, cwd, env, ready) =>
  new Promise((resolve, reject) => {
    // Only npx needs a shell on Windows; node is spawned directly (its path contains spaces).
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
    setTimeout(() => reject(new Error(`${cmd} did not become ready`)), 60_000);
  });

await start(process.execPath, ['--env-file=.env.test', 'src/server.js'], join(REPO, 'backend'), {
  NODE_ENV: 'development',
  PORT: String(API_PORT),
  APP_URL: WEB,
  CLIENT_ORIGIN: WEB,
  ADMIN_SETUP_CODE: SETUP_CODE,
  MAIL_MODE: 'outbox',
  RECAPTCHA_MODE: 'off',
  HIBP_ENABLED: 'false',
  LOG_LEVEL: 'info', // the test env silences logs; we wait for the 'listening' line
  UPLOAD_DIR: join(HERE, 'uploads'), // never the repo's uploads folder
}, /API listening/);
await start('npx', ['vite', '--port', String(WEB_PORT), '--strictPort', '--host', 'localhost'], join(REPO, 'frontend'), {
  VITE_API_BASE_URL: `http://localhost:${API_PORT}/api/v1`,
}, /ready in|Local:/);
step('isolated API and site started');

const latestLink = (email, template) => {
  const safe = email.replace(/[^a-z0-9@._-]/gi, '_');
  const file = readdirSync(OUTBOX).filter((f) => f.includes(`-${template}-${safe}`)).sort().at(-1);
  const html = readFileSync(join(OUTBOX, file), 'utf8');
  return html.match(/href="([^"]+)"/)[1].replaceAll('&amp;', '&');
};

const browser = await chromium.launch({ channel: 'msedge', headless: true });
const context = await browser.newContext({ viewport: { width: 1366, height: 860 } });
const page = await context.newPage();
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(m.text());
});
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
const authLog = [];
page.on('response', (r) => { if (r.url().includes('/api/v1/')) authLog.push(`${((Date.now() - t0) / 1000).toFixed(2)}s ${r.request().method()} ${new URL(r.url()).pathname} -> ${r.status()}`); });
page.on('requestfailed', (r) => { if (r.url().includes('/api/v1/')) authLog.push(`${((Date.now() - t0) / 1000).toFixed(2)}s ${r.method()} ${new URL(r.url()).pathname} FAILED ${r.failure()?.errorText}`); });
const shot = (name) => page.screenshot({ path: `shots/e2e-${name}.png` });
const settle = () => page.waitForTimeout(1200);

try {
  const email = 'meera.e2e@example.com';
  const password = 'Turmeric-and-tulsi-2026';

  // ── Member, email switched off: sign up → straight into the dashboard ──
  await page.goto(`${WEB}/signup`);
  await page.getByLabel('Your name').fill('Meera Iyer');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: 'Create my account' }).click();
  await page.waitForURL(`${WEB}/dashboard`);
  await page.getByRole('heading', { name: /Welcome, Meera/ }).waitFor();
  step('sign up → signed in, dashboard (no email step)', (await page.getByText('Confirm your email').count()) === 0);
  await settle();
  await shot('dashboard');

  // ── Sign out and back in without ever confirming the email ──
  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  await page.waitForURL(`${WEB}/`);
  // Wait until sign-out has finished (the header offers Join free again) before loading another page.
  await page.locator('header.header').getByRole('link', { name: 'Join free' }).waitFor();
  await page.goto(`${WEB}/signin`);
  step('no "Forgot password?" link', (await page.getByRole('link', { name: 'Forgot password?' }).count()) === 0);
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Sign in' }).last().click();
  await page.waitForURL(`${WEB}/dashboard`);
  step('sign in without a confirmed email');

  // ── Same email again: told plainly, under the email field ──
  const probeContext = await browser.newContext({ viewport: { width: 1366, height: 860 } }); // signed-out visitor
  const probe = await probeContext.newPage();
  await probe.goto(`${WEB}/signup`);
  await probe.getByLabel('Your name').fill('Someone');
  await probe.getByLabel('Email').fill(email);
  await probe.getByLabel('Password', { exact: true }).fill('Another-long-password-9');
  await probe.getByRole('checkbox').check();
  await probe.getByRole('button', { name: 'Create my account' }).click();
  await probe.getByText('An account with this email already exists').waitFor();
  step('duplicate sign-up is explained under the email field');
  await probeContext.close();

  await page.goto(`${WEB}/forgot-password`);
  step('/forgot-password does not exist', (await page.getByRole('heading', { name: 'Page not found' }).count()) === 1);
  await page.goto(`${WEB}/dashboard`);

  // ── Reload keeps the session (refresh cookie) ──
  await page.reload();
  await page.getByRole('heading', { name: /Welcome, Meera/ }).waitFor();
  step('page reload keeps me signed in');

  // ── Turn on 2FA from the dashboard ──
  await page.getByRole('button', { name: 'Turn on' }).click();
  await page.getByRole('button', { name: 'Can’t scan the code?' }).click();
  const secret = await page.locator('.enrol__secret').innerText();
  await settle();
  await shot('member-2fa-qr');
  await page.getByLabel('Digit 1 of 6').fill(totp(secret));
  await page.getByText('Your account is protected').waitFor();
  const backupCodes = await page.locator('.backup-codes code').allInnerTexts();
  step('member turns on 2FA', backupCodes.length === 10, `${backupCodes.length} backup codes`);
  await shot('member-2fa-codes');
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByText('On. Signing in needs your password').waitFor();
  step('dashboard shows 2FA on');

  // ── Sign out, sign in again with a backup code ──
  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  await page.waitForURL(`${WEB}/`);
  await page.goto(`${WEB}/signin`);
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Sign in' }).last().click();
  await page.getByRole('heading', { name: 'Two-step sign-in' }).waitFor();
  await settle();
  await shot('member-2fa-step');
  await page.getByRole('button', { name: 'Lost your phone? Use a backup code' }).click();
  await page.getByLabel('Backup code').fill(backupCodes[0]);
  await page.getByRole('button', { name: 'Verify and continue' }).click();
  await page.waitForURL(`${WEB}/dashboard`);
  step('sign out, then sign in with a backup code');

  // ── Members can't open the admin panel ──
  await page.goto(`${WEB}/admin`);
  await page.getByRole('heading', { name: 'Admin sign-in' }).waitFor();
  step('member visiting /admin sees only the admin sign-in');

  // ── Theme switcher ──
  await page.getByRole('button', { name: /change theme/ }).click();
  await page.getByRole('button', { name: /Ratri/ }).click();
  const theme = await page.evaluate(() => document.documentElement.dataset.theme);
  step('theme switcher applies Ratri', theme === 'ratri');
  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  await page.waitForURL(`${WEB}/`);

  // ── Admin: setup → sign in → forced 2FA → panel ──
  const adminEmail = 'guru.e2e@example.com';
  const adminPassword = 'Banyan-shade-and-still-water';
  await page.goto(`${WEB}/admin/setup`);
  await page.getByLabel('Setup code').fill(SETUP_CODE);
  await page.getByLabel('Your name').fill('Guru Admin');
  await page.getByLabel('Admin email').fill(adminEmail);
  await page.getByLabel('Password', { exact: true }).fill(adminPassword);
  await settle();
  await shot('admin-setup');
  await page.getByRole('button', { name: 'Create admin account' }).click();
  await page.getByRole('heading', { name: 'Admin account created' }).waitFor();
  step('admin setup with the setup code');

  await page.getByRole('link', { name: 'Go to admin sign-in' }).click();
  await page.getByLabel('Admin email').fill(adminEmail);
  await page.getByLabel('Password', { exact: true }).fill(adminPassword);
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByRole('heading', { name: 'Secure your admin account' }).waitFor();
  step('first admin sign-in forces 2FA setup');
  await page.locator('.enrol__qr img').waitFor();
  await settle();
  await shot('admin-2fa-qr');
  await page.getByRole('button', { name: 'Can’t scan the code?' }).click();
  const adminSecret = await page.locator('.enrol__secret').innerText();
  await page.getByLabel('Digit 1 of 6').fill(totp(adminSecret));
  await page.getByText('Your account is protected').waitFor();
  await shot('admin-2fa-codes');
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByRole('heading', { name: 'Guru Admin' }).waitFor();
  await settle();
  await shot('admin-overview');
  const members = await page.locator('.stat').first().innerText();
  step('admin panel overview', /2/.test(members), members.replace(/\s+/g, ' '));

  await page.getByRole('link', { name: /Members/ }).click();
  await page.getByRole('cell', { name: /meera\.e2e@example\.com/ }).waitFor();
  await settle();
  await shot('admin-members');
  step('members list shows Meera');

  await page.getByRole('link', { name: /Audit log/ }).click();
  await page.getByText('admin.setup.created').waitFor();
  await page.getByRole('button', { name: 'Sign-ins' }).click();
  await page.getByText('auth.login.success').first().waitFor();
  await settle();
  await shot('admin-audit');
  step('audit log lists and filters events');

  // ── Conditions: create one, see it publicly ──
  await page.getByRole('link', { name: /Conditions/ }).click();
  await page.getByRole('button', { name: 'New condition' }).click();
  await page.getByLabel('Name').fill('Stress & Anxiety');
  step('web address follows the name', (await page.getByLabel('Web address').inputValue()) === 'stress-and-anxiety');
  await page.getByLabel('Summary').fill('Calming the nervous system with breath and routine.');
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: 'Create condition' }).click();
  await page.getByText('“Stress & Anxiety” was saved.').waitFor();
  await settle();
  await shot('admin-conditions');
  const publicList = await page.evaluate(async (api) => (await fetch(`${api}/conditions`)).json(), `http://localhost:${API_PORT}/api/v1`);
  step('published condition is in the public list', publicList.items.some((c) => c.slug === 'stress-and-anxiety'));

  // Media library: a real photo with camera + GPS data, and a text file pretending to be a JPEG.
  execFileSync(process.execPath, ['--input-type=module', '-e', `
    const sharp = (await import('sharp')).default;
    const fs = await import('node:fs');
    await sharp({ create: { width: 2400, height: 1600, channels: 3, background: '#e8728f' } })
      .withExif({ IFD0: { Make: 'PhoneCo' }, IFD3: { GPSLatitudeRef: 'N', GPSLatitude: '12/1 58/1 0/1' } })
      .jpeg().toFile(process.argv[1]);
    fs.writeFileSync(process.argv[2], 'not really a photo');
  `, join(HERE, 'sunrise.jpg'), join(HERE, 'fake.jpg')], { cwd: join(REPO, 'backend') });
  await page.getByRole('link', { name: /Media/ }).click();
  await page.getByText('No images yet. Drop your first one above.').waitFor();
  await page.getByTestId('media-file-input').setInputFiles([join(HERE, 'sunrise.jpg'), join(HERE, 'fake.jpg')]);
  await page.getByRole('list', { name: 'Uploads' }).getByText('Added to the library.').waitFor({ timeout: 30_000 });
  await page.getByRole('list', { name: 'Uploads' }).getByText(/This file isn’t a JPEG, PNG or WebP image/).waitFor();
  step('upload: photo added, disguised text file refused with the reason');
  const card = page.locator('.media-card img').first();
  await card.waitFor();
  await page.waitForFunction(() => { const img = document.querySelector('.media-card img'); return img && img.complete && img.naturalWidth > 0; }, null, { timeout: 15_000 });
  step('uploaded image displays on the site (cross-origin image allowed)');
  // Read the bytes outside the page: the image route sends no CORS headers (it's for <img>, not scripts).
  const served = await page.request.get(await card.getAttribute('src'));
  const leaked = (await served.body()).includes(Buffer.from('PhoneCo'));
  step('script on another origin cannot read image bytes (no CORS)', await page.evaluate(async (src) => { try { await fetch(src); return false; } catch { return true; } }, await card.getAttribute('src')));
  step('served image has no camera/GPS data', !leaked);
  await page.getByLabel('Alt text').fill('Sunrise over the ghats');
  await page.getByRole('button', { name: 'Save alt text' }).click();
  await page.getByRole('status').getByText('Alt text saved.').waitFor();
  step('alt text saved', (await page.getByText('Needs alt text').count()) === 0);
  await settle();
  await shot('admin-media');

  // Articles: an admin writes, designs and publishes; a reader opens it.
  await page.goto(`${WEB}/admin/articles`);
  await page.getByRole('button', { name: 'New article' }).click();
  await page.getByLabel('Title', { exact: true }).fill('Calming the mind in Sharad');
  await page.getByRole('button', { name: 'Create and start writing' }).click();
  await page.getByRole('heading', { name: 'Card and thumbnail' }).waitFor({ timeout: 20_000 });
  step('admin creates an article and lands in the editor');
  await page.getByLabel('Short description').fill('Simple cooling habits, food and breathing that keep Pitta calm through the bright autumn weeks.');
  await page.getByRole('button', { name: 'Choose thumbnail' }).click();
  await page.getByRole('button', { name: /as thumbnail/ }).first().click();
  const surface = page.locator('.editor-surface');
  await surface.click();
  await page.keyboard.type('Sharad brings clear skies and strong sun after the rains. ');
  await page.keyboard.type('The heat that built up in the monsoon now rises, so Pitta flares: acidity, rashes and short tempers are common. '.repeat(3));
  await page.keyboard.type('Favour cooling foods like rice, moong, ghee, amla and pomegranate, and practise Sheetali and Nadi Shodhana in the evening.');
  await page.getByText(/^Saved · /).waitFor({ timeout: 20_000 });
  step('autosave saves the draft');
  await page.waitForTimeout(2000); // the checklist refreshes after a save
  await settle();
  await shot('admin-editor');
  await page.getByRole('button', { name: 'Publish', exact: true }).click();
  await page.getByText('Published: readers can see it now.').waitFor({ timeout: 20_000 });
  step('article published');
  await page.goto(`${WEB}/articles/calming-the-mind-in-sharad`);
  await page.getByRole('heading', { level: 1, name: 'Calming the mind in Sharad' }).waitFor({ timeout: 20_000 });
  step('reader sees the published article', (await page.getByText(/Favour cooling foods like rice/).count()) === 1);
  await settle();
  await shot('reader-article');
  await page.goto(`${WEB}/articles`);
  await page.getByText('Calming the mind in Sharad').first().waitFor({ timeout: 20_000 });
  step('article appears in the public list');
  await page.goto(`${WEB}/admin`);

  // Same panel in another theme, for review.
  await page.getByRole('link', { name: 'Overview' }).click();
  await page.getByRole('button', { name: /change theme/ }).click();
  await page.getByRole('button', { name: /Vana/ }).click();
  await settle();
  await shot('admin-overview-vana');

  // ── Change the setup code from Admin → Security (password + fresh 2FA code) ──
  const panelCode = 'panel-code-e2e-0123456789-abcdefghij';
  await page.goto(`${WEB}/admin/security`);
  await page.getByLabel('Your password').fill(adminPassword);
  await page.getByLabel('Code from your authenticator app').fill(totp(adminSecret));
  await page.getByLabel('New setup code', { exact: true }).fill(panelCode);
  await page.getByLabel('New setup code again').fill(panelCode);
  await page.getByRole('button', { name: 'Change setup code' }).click();
  await page.getByText(/Setup code changed/).waitFor({ timeout: 20_000 });
  step('setup code changed in Admin → Security', (await page.getByText('Set here, in the Admin panel.').count()) === 1);
  await settle();
  await shot('admin-security');
  await page.goto(`${WEB}/admin/recover`);
  await page.getByLabel('Setup code').fill(SETUP_CODE);
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByText('The setup code is not correct').waitFor();
  step('the old setup code no longer works');

  // ── Admin recovery with the setup code: forgotten email/password or lost 2FA device ──
  const recoveredPassword = 'Monsoon-clouds-over-hills-7';
  await page.goto(`${WEB}/admin/recover`);
  await page.getByLabel('Setup code').fill(panelCode);
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByRole('radio', { name: new RegExp(adminEmail.replace('.', '\\.')) }).waitFor();
  await page.getByLabel('New password').fill(recoveredPassword);
  await settle();
  await shot('admin-recover');
  await page.getByRole('button', { name: 'Recover this account' }).click();
  await page.getByRole('heading', { name: 'Admin account recovered' }).waitFor();
  step('admin recovered with the setup code (email shown)', (await page.getByText(adminEmail).count()) > 0);
  await page.goto(`${WEB}/admin`);
  await page.getByRole('heading', { name: 'Admin sign-in' }).waitFor({ timeout: 20_000 });
  step('the old admin session was signed out');
  await page.getByLabel('Admin email').fill(adminEmail);
  await page.getByLabel('Password', { exact: true }).fill(recoveredPassword);
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByRole('heading', { name: 'Secure your admin account' }).waitFor();
  step('new password works and 2FA must be set up again');
} catch (error) {
  step('flow', false, error.message.split('\n')[0]);
  console.log('AUTH LOG:');
  for (const line of authLog.slice(-16)) console.log(`  ${line}`);
  console.log(`URL at failure: ${page.url()}`);
  await shot('failure').catch(() => {});
} finally {
  for (const s of steps) console.log(`${s.result}  ${s.step}${s.note ? `  (${s.note})` : ''}`);
  // Expected browser messages: failed requests the UI handles (e.g. the deliberate 401 for a member on /admin).
  console.log(errors.length ? `Console errors:\n${[...new Set(errors)].join('\n')}` : 'No console errors');
  stopServers();
  void browser.close();
  process.exit(steps.some((s) => s.result === 'FAIL') ? 1 : 0);
}
