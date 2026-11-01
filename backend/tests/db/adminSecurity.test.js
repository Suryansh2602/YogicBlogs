// Changing the setup code from the Admin panel (real database): admin + 2FA only, password and a fresh
// 2FA code required, stored hashed, applies at once to recovery, falls back to .env when removed, audited.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import * as OTPAuth from 'otpauth';

const { createApp } = await import('../../src/app.js');
const { closeDatabase, models } = await import('../../src/config/db.js');
const { env } = await import('../../src/config/env.js');
const { signAccessToken } = await import('../../src/modules/auth/token.service.js');
const { connectAsMigrator, resetTables } = await import('./helpers.js');

const PASSWORD = 'Banyan-roots-run-deep-42';
const ADMIN = 'owner-admin@example.com';
const NEW_CODE = 'panel-setup-code-0123456789-abcdefgh';
const totpNow = (secret) => new OTPAuth.TOTP({ secret: OTPAuth.Secret.fromBase32(secret), digits: 6, period: 30 }).generate();

describe('setup code from the Admin panel (real database)', () => {
  let app;
  let migrator;
  let adminId;
  let secret;
  let auth;
  const auditActions = async () => (await migrator.query(`SELECT action FROM \`${env.AUDIT_DB_NAME}\`.audit_logs ORDER BY id`))[0].map((a) => a.action);
  // A 2FA code is accepted once per 30 s step (replay protection); tests clear the record of the last one.
  const freshTotp = async () => {
    await models.UserTwoFactor.update({ lastUsedStep: null }, { where: { userId: adminId } });
    return totpNow(secret);
  };
  const api = (method, path) => request(app)[method](`/api/v1${path}`).set('Authorization', auth);

  beforeAll(async () => {
    migrator = connectAsMigrator();
    await resetTables(migrator);
    app = createApp();
    const created = await request(app).post('/api/v1/admin/setup').send({ setupCode: env.ADMIN_SETUP_CODE, email: ADMIN, password: PASSWORD, displayName: 'Owner' }).expect(201);
    adminId = created.body.user.id;
    const login = await request(app).post('/api/v1/auth/admin/login').send({ email: ADMIN, password: PASSWORD }).expect(200);
    const setup = await request(app).post('/api/v1/auth/login/2fa/setup').send({ mfaTicket: login.body.mfaTicket }).expect(200);
    secret = setup.body.secret;
    const enabled = await request(app).post('/api/v1/auth/login/2fa/enable').send({ mfaTicket: login.body.mfaTicket, code: totpNow(secret) }).expect(200);
    auth = `Bearer ${enabled.body.accessToken}`;
  });

  afterAll(async () => {
    await migrator.close();
    await closeDatabase();
  });

  it('is only for a signed-in admin who passed 2FA', async () => {
    await request(app).get('/api/v1/admin/security').expect(401);
    const member = await models.User.create({ email: 'member@example.com', displayName: 'Member', role: 'user', emailVerifiedAt: new Date() });
    const memberToken = await signAccessToken(member, { sid: 'sid-m', amr: ['pwd', 'otp'] });
    await request(app).get('/api/v1/admin/security').set('Authorization', `Bearer ${memberToken}`).expect(403);
    const adminNoOtp = await signAccessToken(await models.User.findByPk(adminId), { sid: 'sid-a', amr: ['pwd'] });
    await request(app).get('/api/v1/admin/security').set('Authorization', `Bearer ${adminNoOtp}`).expect(403);
  });

  it('shows where the code comes from and counts wrong codes tried in the last 24 hours', async () => {
    await request(app).post('/api/v1/admin/recover/lookup').send({ setupCode: 'wrong-code-wrong-code' }).expect(403);
    const res = await api('get', '/admin/security').expect(200);
    expect(res.headers['cache-control']).toBe('no-store');
    expect(res.body).toEqual({ setupCode: { source: 'env', changedAt: null, changedBy: null }, failedCodeAttempts24h: 1 });
  });

  it('needs the right password and a fresh 2FA code, and audits failures', async () => {
    const wrongPassword = await api('put', '/admin/security/setup-code').send({ password: 'not-my-password', totpCode: await freshTotp(), newCode: NEW_CODE }).expect(403);
    expect(wrongPassword.body.error.code).toBe('PASSWORD_INCORRECT');
    const wrongCode = await api('put', '/admin/security/setup-code').send({ password: PASSWORD, totpCode: '000000', newCode: NEW_CODE }).expect(403);
    expect(wrongCode.body.error.code).toBe('TOTP_INVALID');
    expect(await auditActions()).toContain('admin.setup_code.change_failed');
  });

  it('refuses a short code, spaces, or the admin’s own password', async () => {
    const short = await api('put', '/admin/security/setup-code').send({ password: PASSWORD, totpCode: '123456', newCode: 'too-short' }).expect(400);
    expect(JSON.stringify(short.body)).toMatch(/at least 24 characters/);
    await api('put', '/admin/security/setup-code').send({ password: PASSWORD, totpCode: '123456', newCode: 'has spaces in it but is long enough' }).expect(400);
    const same = await api('put', '/admin/security/setup-code').send({ password: 'Banyan-roots-run-deep-42-and-more', totpCode: await freshTotp(), newCode: 'Banyan-roots-run-deep-42-and-more' });
    expect(same.status).toBe(403); // the wrong password is caught first; with the right one:
    await models.User.update({ passwordHash: await (await import('../../src/modules/auth/password.service.js')).hashPassword('Banyan-roots-run-deep-42-and-more') }, { where: { id: adminId } });
    const own = await api('put', '/admin/security/setup-code').send({ password: 'Banyan-roots-run-deep-42-and-more', totpCode: await freshTotp(), newCode: 'Banyan-roots-run-deep-42-and-more' }).expect(400);
    expect(JSON.stringify(own.body)).toMatch(/different from your password/);
    await models.User.update({ passwordHash: await (await import('../../src/modules/auth/password.service.js')).hashPassword(PASSWORD) }, { where: { id: adminId } });
  });

  it('changes the code: stored hashed only, applies at once, the old code stops working', async () => {
    const res = await api('put', '/admin/security/setup-code').send({ password: PASSWORD, totpCode: await freshTotp(), newCode: NEW_CODE }).expect(200);
    expect(res.body.setupCode).toMatchObject({ source: 'panel', changedBy: 'Owner', changedAt: expect.any(String) });
    const [[row]] = await migrator.query('SELECT setup_code_hash AS hash FROM admin_security');
    expect(row.hash).toMatch(/^\$argon2id\$/);
    expect(row.hash).not.toContain(NEW_CODE);
    expect(JSON.stringify((await api('get', '/admin/security').expect(200)).body)).not.toMatch(/argon2|hash/);

    await request(app).post('/api/v1/admin/recover/lookup').send({ setupCode: env.ADMIN_SETUP_CODE }).expect(403); // .env code no longer counts
    const lookup = await request(app).post('/api/v1/admin/recover/lookup').send({ setupCode: NEW_CODE }).expect(200);
    expect(lookup.body.admins[0].email).toBe(ADMIN);
    expect(await auditActions()).toContain('admin.setup_code.changed');
    expect(JSON.stringify(await migrator.query(`SELECT metadata FROM \`${env.AUDIT_DB_NAME}\`.audit_logs`))).not.toContain(NEW_CODE); // never logged
  });

  it('refuses a replayed 2FA code', async () => {
    const code = await freshTotp();
    await api('put', '/admin/security/setup-code').send({ password: PASSWORD, totpCode: code, newCode: `${NEW_CODE}-2` }).expect(200);
    const replay = await api('put', '/admin/security/setup-code').send({ password: PASSWORD, totpCode: code, newCode: `${NEW_CODE}-3` }).expect(403);
    expect(replay.body.error.code).toBe('TOTP_INVALID');
  });

  it('removing the panel code falls back to ADMIN_SETUP_CODE from .env', async () => {
    const res = await api('delete', '/admin/security/setup-code').send({ password: PASSWORD, totpCode: await freshTotp() }).expect(200);
    expect(res.body.setupCode).toEqual({ source: 'env', changedAt: null, changedBy: null });
    await request(app).post('/api/v1/admin/recover/lookup').send({ setupCode: `${NEW_CODE}-2` }).expect(403);
    await request(app).post('/api/v1/admin/recover/lookup').send({ setupCode: env.ADMIN_SETUP_CODE }).expect(200);
    expect(await auditActions()).toContain('admin.setup_code.removed');
  });

  it('refuses extra fields', async () => {
    await api('put', '/admin/security/setup-code').send({ password: PASSWORD, totpCode: '123456', newCode: NEW_CODE, source: 'env' }).expect(400);
  });
});
