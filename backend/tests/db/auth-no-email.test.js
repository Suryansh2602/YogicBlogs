// Auth with email switched off (EMAIL_ENABLED=false, the current setting): sign-up signs people in at once,
// unconfirmed accounts can sign in, and the email routes don't exist. Real HTTP app + real MySQL.
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import request from 'supertest';

// Set before the app (and its env) is imported; each test file runs in its own module scope.
process.env.EMAIL_ENABLED = 'false';

const sendMail = vi.fn();
vi.mock('../../src/services/mailer.js', async (importOriginal) => ({ ...(await importOriginal()), sendMail }));

const { createApp } = await import('../../src/app.js');
const { closeDatabase } = await import('../../src/config/db.js');
const { env } = await import('../../src/config/env.js');
const { connectAsMigrator, resetTables } = await import('./helpers.js');

const PASSWORD = 'Neem-and-tulsi-at-dawn-7';
const signUp = (app, email, displayName = 'Kavya') =>
  request(app).post('/api/v1/auth/register').send({ email, password: PASSWORD, displayName, acceptTerms: true, acceptPrivacy: true });

describe('auth with email switched off', () => {
  let app;
  let migrator;

  beforeAll(async () => {
    expect(env.EMAIL_ENABLED).toBe(false);
    migrator = connectAsMigrator();
    await resetTables(migrator);
    app = createApp();
  });

  afterAll(async () => {
    await Promise.all([migrator.close(), closeDatabase()]);
  });

  it('signs a new member in straight after sign-up', async () => {
    const res = await signUp(app, 'kavya@example.com').expect(201);
    expect(res.body.user).toMatchObject({ email: 'kavya@example.com', role: 'user', emailVerified: false });
    expect(res.headers['set-cookie'].join(';')).toMatch(/hm_rt=.+HttpOnly/i);
    await request(app).get('/api/v1/users/me').set('Authorization', `Bearer ${res.body.accessToken}`).expect(200);
    expect(sendMail).not.toHaveBeenCalled();
  });

  it('records consents and no email token', async () => {
    const [[{ consents }]] = await migrator.query("SELECT COUNT(*) AS consents FROM user_consents c JOIN users u ON u.id = c.user_id WHERE u.email = 'kavya@example.com'");
    const [[{ tokens }]] = await migrator.query('SELECT COUNT(*) AS tokens FROM auth_tokens');
    expect(Number(consents)).toBe(2);
    expect(Number(tokens)).toBe(0);
  });

  it('says clearly when the email is already registered, under the email field', async () => {
    const res = await signUp(app, 'kavya@example.com').expect(409);
    expect(res.body.error).toMatchObject({ code: 'EMAIL_TAKEN', details: [{ path: 'email', message: expect.stringMatching(/already exists/) }] });
  });

  it('lets an account that never confirmed its email sign in', async () => {
    const res = await request(app).post('/api/v1/auth/login').send({ email: 'kavya@example.com', password: PASSWORD }).expect(200);
    expect(res.body.accessToken).toEqual(expect.any(String));
  });

  it('still checks the password policy before creating anything', async () => {
    const res = await request(app)
      .post('/api/v1/auth/register')
      .send({ email: 'short@example.com', password: 'short', displayName: 'S', acceptTerms: true, acceptPrivacy: true })
      .expect(400);
    expect(res.body.error.details[0].message).toMatch(/Your password has 5 characters/);
  });

  it.each(['/verify-email', '/verify-email/resend', '/password/forgot', '/password/reset'])('has no %s route', async (path) => {
    await request(app).post(`/api/v1/auth${path}`).send({}).expect(404);
  });
});
