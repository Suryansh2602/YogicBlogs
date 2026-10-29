// Admin recovery with the setup code (real database): find a forgotten admin email, set a new password,
// remove 2FA and sign out every session, all audited; never for members, never a new admin.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import * as OTPAuth from 'otpauth';

const { createApp } = await import('../../src/app.js');
const { closeDatabase, models } = await import('../../src/config/db.js');
const { env } = await import('../../src/config/env.js');
const { connectAsMigrator, resetTables } = await import('./helpers.js');

const PASSWORD = 'Banyan-roots-run-deep-42';
const NEW_PASSWORD = 'Monsoon-clouds-over-hills-7';
const ADMIN = 'owner-admin@example.com';
const totpNow = (secret) => new OTPAuth.TOTP({ secret: OTPAuth.Secret.fromBase32(secret), digits: 6, period: 30 }).generate();

describe('admin recovery with the setup code (real database)', () => {
  let app;
  let migrator;
  let adminId;
  let oldAccessToken;
  let oldCookies;
  const auditActions = async () => (await migrator.query(`SELECT action FROM \`${env.AUDIT_DB_NAME}\`.audit_logs ORDER BY id`))[0].map((a) => a.action);

  beforeAll(async () => {
    migrator = connectAsMigrator();
    await resetTables(migrator);
    app = createApp();
    // The first admin, with 2FA, signed in: the account that will be recovered.
    const created = await request(app).post('/api/v1/admin/setup').send({ setupCode: env.ADMIN_SETUP_CODE, email: ADMIN, password: PASSWORD, displayName: 'Owner' }).expect(201);
    adminId = created.body.user.id;
    const login = await request(app).post('/api/v1/auth/admin/login').send({ email: ADMIN, password: PASSWORD }).expect(200);
    const setup = await request(app).post('/api/v1/auth/login/2fa/setup').send({ mfaTicket: login.body.mfaTicket }).expect(200);
    const enabled = await request(app).post('/api/v1/auth/login/2fa/enable').send({ mfaTicket: login.body.mfaTicket, code: totpNow(setup.body.secret) }).expect(200);
    oldAccessToken = enabled.body.accessToken;
    oldCookies = enabled.headers['set-cookie'];
    await models.User.create({ email: 'member@example.com', displayName: 'Member', role: 'user', emailVerifiedAt: new Date() });
  });

  afterAll(async () => {
    await migrator.close();
    await closeDatabase();
  });

  it('refuses a wrong code, and audits the attempt', async () => {
    const res = await request(app).post('/api/v1/admin/recover/lookup').send({ setupCode: 'wrong-code-wrong-code' }).expect(403);
    expect(res.body.error.code).toBe('SETUP_CODE_INVALID');
    await request(app).post('/api/v1/admin/recover').send({ setupCode: 'wrong-code-wrong-code', adminId, password: NEW_PASSWORD }).expect(403);
    expect(await auditActions()).toContain('admin.recovery.failure');
  });

  it('lists only the admin accounts, with their emails, to the holder of the code', async () => {
    const res = await request(app).post('/api/v1/admin/recover/lookup').send({ setupCode: env.ADMIN_SETUP_CODE }).expect(200);
    expect(res.headers['cache-control']).toBe('no-store');
    expect(res.body).toEqual({ admins: [{ id: adminId, email: ADMIN, displayName: 'Owner' }] });
    expect(await auditActions()).toContain('admin.recovery.lookup');
  });

  it('never recovers a member, and checks the new password like everywhere else', async () => {
    const member = await models.User.findOne({ where: { email: 'member@example.com' } });
    await request(app).post('/api/v1/admin/recover').send({ setupCode: env.ADMIN_SETUP_CODE, adminId: member.id, password: NEW_PASSWORD }).expect(404);
    const weak = await request(app).post('/api/v1/admin/recover').send({ setupCode: env.ADMIN_SETUP_CODE, adminId, password: 'short' }).expect(400);
    expect(JSON.stringify(weak.body)).toMatch(/12/); // "Use at least 12" characters
    expect((await models.User.findByPk(member.id)).role).toBe('user');
  });

  it('recovers: new password, 2FA removed, every session signed out, suspended admin reactivated; no new admin', async () => {
    await models.User.update({ status: 'suspended' }, { where: { id: adminId } });
    const res = await request(app).post('/api/v1/admin/recover').send({ setupCode: env.ADMIN_SETUP_CODE, adminId, password: NEW_PASSWORD }).expect(200);
    expect(res.body).toEqual({ email: ADMIN });

    // Old sessions no longer work.
    await request(app).get('/api/v1/admin/stats').set('Authorization', `Bearer ${oldAccessToken}`).expect(401);
    const refresh = await request(app).post('/api/v1/auth/refresh').set('Origin', env.CLIENT_ORIGIN[0]).set('Cookie', oldCookies.map((c) => c.split(';')[0]).join('; '));
    expect(refresh.status).not.toBe(200);

    // The old password is gone; the new one works and asks for a fresh 2FA setup.
    await request(app).post('/api/v1/auth/admin/login').send({ email: ADMIN, password: PASSWORD }).expect(401);
    const login = await request(app).post('/api/v1/auth/admin/login').send({ email: ADMIN, password: NEW_PASSWORD }).expect(200);
    expect(login.body).toEqual({ mfaSetupRequired: true, mfaTicket: expect.any(String) });

    expect(await models.UserTwoFactor.count({ where: { userId: adminId } })).toBe(0);
    expect(await models.TwoFactorBackupCode.count({ where: { userId: adminId } })).toBe(0);
    expect((await models.User.findByPk(adminId)).status).toBe('active');
    expect(await models.User.count({ where: { role: 'admin' } })).toBe(1);
    expect(await auditActions()).toContain('admin.recovery.completed');

    // Setup is still closed: the code recovers, it never creates another admin.
    const again = await request(app).post('/api/v1/admin/setup').send({ setupCode: env.ADMIN_SETUP_CODE, email: 'second@example.com', password: PASSWORD, displayName: 'Second' }).expect(409);
    expect(again.body.error.code).toBe('SETUP_CLOSED');
  });

  it('refuses extra fields (e.g. trying to set a role)', async () => {
    const res = await request(app).post('/api/v1/admin/recover').send({ setupCode: env.ADMIN_SETUP_CODE, adminId, password: NEW_PASSWORD, role: 'admin' }).expect(400);
    expect(res.body.error.code).toBe('VALIDATION_FAILED');
  });
});
