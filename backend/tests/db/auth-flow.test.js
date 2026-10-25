// End-to-end auth flows through the real HTTP app and the real MySQL test database:
// user sign-up → verify → sign-in, sessions (refresh rotation, theft detection, sign-out), password reset,
// lockout, user 2FA, and admin bootstrap → forced 2FA enrolment → admin panel.
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import * as OTPAuth from 'otpauth';

const sent = [];
vi.mock('../../src/services/mailer.js', async (importOriginal) => ({
  ...(await importOriginal()),
  sendMail: vi.fn(async (template, to, data) => {
    sent.push({ template, to, data });
  }),
}));

const { createApp } = await import('../../src/app.js');
const { closeDatabase } = await import('../../src/config/db.js');
const { env } = await import('../../src/config/env.js');
const { connectAsMigrator, resetTables } = await import('./helpers.js');

const PASSWORD = 'Banyan-roots-run-deep-42';
const lastLink = (to, template) => new URL(sent.filter((m) => m.to === to && m.template === template).at(-1).data.url);
/** "name=value" pairs from Set-Cookie headers. */
const cookiesOf = (res) => Object.fromEntries((res.headers['set-cookie'] ?? []).map((c) => c.split(';')[0].split('=')));
const cookieHeader = (jar) =>
  Object.entries(jar)
    .map(([k, v]) => `${k}=${v}`)
    .join('; ');
const totpNow = (secret) => new OTPAuth.TOTP({ secret: OTPAuth.Secret.fromBase32(secret), digits: 6, period: 30 }).generate();

describe('auth flows (real database)', () => {
  let app;
  let migrator;

  beforeAll(async () => {
    migrator = connectAsMigrator();
    await resetTables(migrator);
    app = createApp();
  });

  afterAll(async () => {
    await Promise.all([migrator.close(), closeDatabase()]);
  });

  describe('user', () => {
    const email = 'meera@example.com';

    it('signs up, verifies the email and signs in', async () => {
      await request(app)
        .post('/api/v1/auth/register')
        .send({ email, password: PASSWORD, displayName: 'Meera', acceptTerms: true, acceptPrivacy: true })
        .expect(202);

      const link = lastLink(email, 'verifyEmail');
      expect(link.origin).toBe(env.APP_URL);
      await request(app).post('/api/v1/auth/verify-email').send({ token: link.searchParams.get('token') }).expect(200);

      const res = await request(app).post('/api/v1/auth/login').send({ email, password: PASSWORD }).expect(200);
      expect(res.body.user).toMatchObject({ email, role: 'user', emailVerified: true, twoFactorEnabled: false });
      expect(res.headers['set-cookie'].join(';')).toMatch(/hm_rt=.+HttpOnly/i);

      const me = await request(app).get('/api/v1/users/me').set('Authorization', `Bearer ${res.body.accessToken}`).expect(200);
      expect(me.body.user.email).toBe(email);
    });

    it('records the consents and the audit trail', async () => {
      const [consents] = await migrator.query(
        'SELECT kind, version FROM user_consents c JOIN users u ON u.id = c.user_id WHERE u.email = ? ORDER BY kind',
        { replacements: [email] },
      );
      expect(consents.map((c) => c.kind)).toEqual(['privacy', 'terms']);
      const [actions] = await migrator.query(`SELECT action FROM \`${env.AUDIT_DB_NAME}\`.audit_logs ORDER BY id`);
      expect(actions.map((a) => a.action)).toEqual(['auth.register', 'auth.email.verified', 'auth.login.success']);
    });
  });

  describe('sessions', () => {
    const email = 'arjun@example.com';
    let sessionApp;
    let jar;
    let csrfToken;

    const signIn = async (password = PASSWORD) => {
      const res = await request(sessionApp).post('/api/v1/auth/login').send({ email, password });
      if (res.status === 200) Object.assign(jar, cookiesOf(res));
      return res;
    };
    const cookieCall = (path, cookies = jar) =>
      request(sessionApp)
        .post(path)
        .set('Origin', env.CLIENT_ORIGIN[0])
        .set('X-CSRF-Token', csrfToken)
        .set('Cookie', cookieHeader(cookies));
    const bearer = (res) => `Bearer ${res.body.accessToken}`;
    const tokenFrom = (template) => lastLink(email, template).searchParams.get('token');

    beforeAll(async () => {
      // Own app instance = own in-memory rate-limit counters, so these tests don't eat the others' budget.
      sessionApp = createApp();
      jar = {};
      await request(sessionApp)
        .post('/api/v1/auth/register')
        .send({ email, password: PASSWORD, displayName: 'Arjun', acceptTerms: true, acceptPrivacy: true })
        .expect(202);
      await request(sessionApp).post('/api/v1/auth/verify-email').send({ token: tokenFrom('verifyEmail') }).expect(200);
      const csrf = await request(sessionApp).get('/api/v1/auth/csrf').expect(200);
      csrfToken = csrf.body.csrfToken;
      Object.assign(jar, cookiesOf(csrf));
    });

    it('rotates the refresh token on every refresh', async () => {
      expect((await signIn()).status).toBe(200);
      const first = jar.hm_rt;
      const res = await cookieCall('/api/v1/auth/refresh').expect(200);
      expect(res.body.accessToken).toEqual(expect.any(String));
      expect(cookiesOf(res).hm_rt).not.toBe(first);
      Object.assign(jar, cookiesOf(res));
    });

    it('treats a reused old refresh token as theft: revokes the session and alerts the user', async () => {
      const stolen = jar.hm_rt;
      const rotated = await cookieCall('/api/v1/auth/refresh').expect(200);
      const current = cookiesOf(rotated).hm_rt;
      // Move the rotation outside the two-tab race window (10 s).
      await migrator.query("UPDATE refresh_tokens SET revoked_at = NOW() - INTERVAL 1 MINUTE WHERE revoked_reason = 'rotated'");

      const replay = await cookieCall('/api/v1/auth/refresh', { ...jar, hm_rt: stolen }).expect(401);
      expect(replay.body.error.code).toBe('SESSION_REVOKED');
      expect(sent.at(-1)).toMatchObject({ template: 'sessionAlert', to: email });
      // The legitimate holder's newest token is dead too: the whole session (family) was revoked.
      await cookieCall('/api/v1/auth/refresh', { ...jar, hm_rt: current }).expect(401);
    });

    it('re-issues for a token rotated a moment ago (lost reply / reload mid-refresh), and both new tokens work', async () => {
      await signIn();
      const old = jar.hm_rt;
      const res = await cookieCall('/api/v1/auth/refresh').expect(200);
      // The browser never received res's cookie (e.g. the page reloaded) and presents the old one again.
      const again = await cookieCall('/api/v1/auth/refresh', { ...jar, hm_rt: old }).expect(200);
      expect(again.body.accessToken).toEqual(expect.any(String));
      await cookieCall('/api/v1/auth/refresh', { ...jar, hm_rt: cookiesOf(again).hm_rt }).expect(200);
      await cookieCall('/api/v1/auth/refresh', { ...jar, hm_rt: cookiesOf(res).hm_rt }).expect(200);
    });

    it('never revives a signed-out session with a recently rotated token', async () => {
      await signIn();
      const old = jar.hm_rt;
      const res = await cookieCall('/api/v1/auth/refresh').expect(200);
      await cookieCall('/api/v1/auth/logout', { ...jar, hm_rt: cookiesOf(res).hm_rt }).expect(204);
      const revived = await cookieCall('/api/v1/auth/refresh', { ...jar, hm_rt: old }).expect(401);
      expect(revived.body.error.code).toBe('NO_SESSION');
    });

    it('signs out: the refresh token and the access token both stop working at once', async () => {
      const login = await signIn();
      await cookieCall('/api/v1/auth/logout').expect(204);
      await cookieCall('/api/v1/auth/refresh').expect(401);
      await request(sessionApp).get('/api/v1/users/me').set('Authorization', bearer(login)).expect(401);
    });

    it('signs out everywhere', async () => {
      const a = await signIn();
      const b = await signIn();
      await request(sessionApp).post('/api/v1/auth/logout-all').set('Authorization', bearer(a)).expect(204);
      await request(sessionApp).get('/api/v1/users/me').set('Authorization', bearer(b)).expect(401);
      await cookieCall('/api/v1/auth/refresh', { ...jar, hm_rt: cookiesOf(b).hm_rt }).expect(401);
    });

    it('updates the profile name', async () => {
      const login = await signIn();
      const res = await request(sessionApp)
        .patch('/api/v1/users/me')
        .set('Authorization', bearer(login))
        .send({ displayName: '  Arjun Sharma ' })
        .expect(200);
      expect(res.body.user.displayName).toBe('Arjun Sharma');
    });

    it('lets a user turn on 2FA, then asks for a code at sign-in and burns the ticket after 5 wrong codes', async () => {
      const login = await signIn();
      const setup = await request(sessionApp).post('/api/v1/auth/2fa/setup').set('Authorization', bearer(login)).expect(200);
      await request(sessionApp).post('/api/v1/auth/2fa/enable').set('Authorization', bearer(login)).send({ code: '123456' }).expect(400);
      const on = await request(sessionApp)
        .post('/api/v1/auth/2fa/enable')
        .set('Authorization', bearer(login))
        .send({ code: totpNow(setup.body.secret) })
        .expect(200);
      expect(on.body.backupCodes).toHaveLength(10);
      await request(sessionApp).post('/api/v1/auth/2fa/setup').set('Authorization', bearer(login)).expect(409);

      const next = await signIn();
      expect(next.body).toEqual({ mfaRequired: true, mfaTicket: expect.any(String) });
      for (let i = 0; i < 4; i += 1) {
        const wrong = await request(sessionApp).post('/api/v1/auth/login/2fa').send({ mfaTicket: next.body.mfaTicket, code: '000000' });
        expect(wrong.body.error.code).toBe('INVALID_CODE');
      }
      const last = await request(sessionApp).post('/api/v1/auth/login/2fa').send({ mfaTicket: next.body.mfaTicket, code: '000000' });
      expect(last.body.error.code).toBe('MFA_TICKET_INVALID');
      // Even a valid backup code can't revive a burnt ticket.
      await request(sessionApp)
        .post('/api/v1/auth/login/2fa')
        .send({ mfaTicket: next.body.mfaTicket, code: on.body.backupCodes[1] })
        .expect(401);
    });

    it('resets a forgotten password; only the newest link works and every session is signed out', async () => {
      await request(sessionApp).post('/api/v1/auth/password/forgot').send({ email }).expect(202);
      await request(sessionApp).post('/api/v1/auth/password/forgot').send({ email: 'nobody@example.com' }).expect(202);
      const first = tokenFrom('resetPassword');

      const weak = await request(sessionApp).post('/api/v1/auth/password/reset').send({ token: first, password: 'arjun-arjun-arjun' }).expect(400);
      expect(weak.body.error.code).toBe('WEAK_PASSWORD');

      // A weak password must not burn the link... but requesting a new link does invalidate the earlier one.
      await request(sessionApp).post('/api/v1/auth/password/forgot').send({ email }).expect(202);
      await request(sessionApp).post('/api/v1/auth/password/reset').send({ token: first, password: `${PASSWORD}-new` }).expect(400);

      await request(sessionApp)
        .post('/api/v1/auth/password/reset')
        .send({ token: tokenFrom('resetPassword'), password: `${PASSWORD}-new` })
        .expect(200);
      expect(sent.at(-1)).toMatchObject({ template: 'passwordChanged', to: email });
      expect((await signIn()).status).toBe(401);
      expect((await signIn(`${PASSWORD}-new`)).body.mfaRequired).toBe(true);
    });

    it('re-sends the verification email only to unverified accounts, answering 202 either way', async () => {
      const before = sent.length;
      await request(sessionApp).post('/api/v1/auth/verify-email/resend').send({ email }).expect(202);
      await request(sessionApp).post('/api/v1/auth/verify-email/resend').send({ email: 'nobody@example.com' }).expect(202);
      expect(sent.length).toBe(before);
    });

    it('locks sign-in after 5 wrong passwords, even for the right one', async () => {
      // Fresh per-IP rate-limit budget, so the 429 below can only come from the account lockout.
      sessionApp = createApp();
      for (let i = 0; i < 5; i += 1) expect((await signIn('wrong-password-0000')).status).toBe(401);
      const locked = await signIn(`${PASSWORD}-new`);
      expect(locked.status).toBe(429);
      expect(locked.body.error.code).toBe('LOGIN_LOCKED');
      expect(Number(locked.headers['retry-after'])).toBeGreaterThan(0);
    });

    it('answers 202 to both of two simultaneous sign-ups for the same new email (no enumeration by race)', async () => {
      sessionApp = createApp();
      const body = { email: 'twins@example.com', password: PASSWORD, displayName: 'Twin', acceptTerms: true, acceptPrivacy: true };
      const statuses = await Promise.all(
        Array.from({ length: 4 }, () => request(sessionApp).post('/api/v1/auth/register').send(body).then((r) => r.status)),
      );
      expect(statuses).toEqual([202, 202, 202, 202]);
      const [rows] = await migrator.query("SELECT COUNT(*) AS n FROM users WHERE email = 'twins@example.com'");
      expect(Number(rows[0].n)).toBe(1);
    });
  });

  describe('accounts created while email was off', () => {
    it('a password reset (first proof of the address) removes 2FA a squatter may have turned on', async () => {
      const { models } = await import('../../src/config/db.js');
      const { hashPassword } = await import('../../src/modules/auth/password.service.js');
      const squatApp = createApp();
      const email = 'owner-of-this-inbox@example.com';
      // As if registered by someone else while email was off: never verified, with their own 2FA on.
      const user = await models.User.create({ email, displayName: 'Squatter', passwordHash: await hashPassword('Squatters-own-password-1') });
      await models.UserTwoFactor.create({ userId: user.id, secretEncrypted: 'v1.not.a.real.secret', enabledAt: new Date() });
      await models.TwoFactorBackupCode.create({ userId: user.id, codeHash: 'f'.repeat(64) });

      // The real owner uses "forgot password" with their inbox.
      await request(squatApp).post('/api/v1/auth/password/forgot').send({ email }).expect(202);
      const token = lastLink(email, 'resetPassword').searchParams.get('token');
      await request(squatApp).post('/api/v1/auth/password/reset').send({ token, password: 'Owners-real-password-2026' }).expect(200);

      const login = await request(squatApp).post('/api/v1/auth/login').send({ email, password: 'Owners-real-password-2026' }).expect(200);
      expect(login.body.accessToken).toEqual(expect.any(String)); // signed in, no squatter 2FA in the way
      expect(await models.UserTwoFactor.count({ where: { userId: user.id } })).toBe(0);
      expect(await models.TwoFactorBackupCode.count({ where: { userId: user.id } })).toBe(0);
      const [actions] = await migrator.query(`SELECT action FROM \`${env.AUDIT_DB_NAME}\`.audit_logs WHERE actor_id = ?`, { replacements: [user.id] });
      expect(actions.map((a) => a.action)).toContain('auth.2fa.cleared_unproven');
    });
  });

  describe('admin', () => {
    const email = 'admin@example.com';
    let backupCodes;
    let secret;

    it('reports that setup is required while there is no admin', async () => {
      const res = await request(app).get('/api/v1/admin/setup/status').expect(200);
      expect(res.body).toEqual({ setupRequired: true });
    });

    it('refuses a wrong setup code', async () => {
      const res = await request(app)
        .post('/api/v1/admin/setup')
        .send({ setupCode: 'wrong-code-wrong-code', email, password: PASSWORD, displayName: 'Admin' })
        .expect(403);
      expect(res.body.error.code).toBe('SETUP_CODE_INVALID');
    });

    it('creates the first admin with the setup code, then closes setup for good', async () => {
      const body = { setupCode: env.ADMIN_SETUP_CODE, email, password: PASSWORD, displayName: 'Admin' };
      const res = await request(app).post('/api/v1/admin/setup').send(body).expect(201);
      expect(res.body.user).toMatchObject({ email, role: 'admin' });

      const again = await request(app).post('/api/v1/admin/setup').send({ ...body, email: 'second@example.com' }).expect(409);
      expect(again.body.error.code).toBe('SETUP_CLOSED');
      expect((await request(app).get('/api/v1/admin/setup/status')).body).toEqual({ setupRequired: false });
    });

    it('gives a new admin no session until 2FA is set up', async () => {
      const login = await request(app).post('/api/v1/auth/admin/login').send({ email, password: PASSWORD }).expect(200);
      expect(login.body).toEqual({ mfaSetupRequired: true, mfaTicket: expect.any(String) });
      expect(login.headers['set-cookie']).toBeUndefined();

      const setup = await request(app).post('/api/v1/auth/login/2fa/setup').send({ mfaTicket: login.body.mfaTicket }).expect(200);
      expect(setup.body.qrDataUrl).toMatch(/^data:image\/png;base64,/);
      ({ secret } = setup.body);

      await request(app).post('/api/v1/auth/login/2fa/enable').send({ mfaTicket: login.body.mfaTicket, code: '000000' }).expect(401);

      const enabled = await request(app)
        .post('/api/v1/auth/login/2fa/enable')
        .send({ mfaTicket: login.body.mfaTicket, code: totpNow(secret) })
        .expect(200);
      expect(enabled.body.backupCodes).toHaveLength(10);
      expect(enabled.body.user).toMatchObject({ role: 'admin', twoFactorEnabled: true });
      ({ backupCodes } = enabled.body);

      const stats = await request(app).get('/api/v1/admin/stats').set('Authorization', `Bearer ${enabled.body.accessToken}`).expect(200);
      // meera, arjun, twins (sessions), the reclaimed inbox owner + this admin.
      expect(stats.body).toMatchObject({ users: 5, admins: 1 });
    });

    it('asks for a code on the next sign-in and rejects a replayed one', async () => {
      const login = await request(app).post('/api/v1/auth/admin/login').send({ email, password: PASSWORD }).expect(200);
      expect(login.body).toEqual({ mfaRequired: true, mfaTicket: expect.any(String) });

      // The code used for enrolment a moment ago belongs to the same 30 s step: a replay.
      const replay = await request(app).post('/api/v1/auth/login/2fa').send({ mfaTicket: login.body.mfaTicket, code: totpNow(secret) });
      expect(replay.status).toBe(401);

      const ok = await request(app).post('/api/v1/auth/login/2fa').send({ mfaTicket: login.body.mfaTicket, code: backupCodes[0] }).expect(200);
      const auth = `Bearer ${ok.body.accessToken}`;

      const users = await request(app).get('/api/v1/admin/users?search=meera').set('Authorization', auth).expect(200);
      expect(users.body).toMatchObject({ total: 1, items: [{ email: 'meera@example.com', role: 'user' }] });
      const logs = await request(app).get('/api/v1/admin/audit-logs?action=admin.').set('Authorization', auth).expect(200);
      expect(logs.body.items.map((l) => l.action)).toEqual(expect.arrayContaining(['admin.setup.created', 'admin.setup.failure']));
      // Each entry names the acting account; anonymous events (a wrong setup code) have none.
      expect(logs.body.items.find((l) => l.action === 'admin.setup.created').actorEmail).toBe(email);
      expect(logs.body.items.find((l) => l.action === 'admin.setup.failure').actorEmail).toBeNull();
    });

    it('accepts each backup code only once', async () => {
      const login = await request(app).post('/api/v1/auth/admin/login').send({ email, password: PASSWORD }).expect(200);
      await request(app).post('/api/v1/auth/login/2fa').send({ mfaTicket: login.body.mfaTicket, code: backupCodes[0] }).expect(401);
    });

    it('keeps signed-in users out of the admin API', async () => {
      const user = await request(app).post('/api/v1/auth/login').send({ email: 'meera@example.com', password: PASSWORD }).expect(200);
      const res = await request(app).get('/api/v1/admin/users').set('Authorization', `Bearer ${user.body.accessToken}`).expect(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });
  });
});
