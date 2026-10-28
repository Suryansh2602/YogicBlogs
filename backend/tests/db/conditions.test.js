// Conditions through the real HTTP app and MySQL: admin CRUD (admin + 2FA only), the public list,
// uniqueness, "in use" protection and auditing.
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';

const { createApp } = await import('../../src/app.js');
const { closeDatabase, models } = await import('../../src/config/db.js');
const { env } = await import('../../src/config/env.js');
const { signAccessToken } = await import('../../src/modules/auth/token.service.js');
const { connectAsMigrator, resetTables } = await import('./helpers.js');

let seq = 0;
async function tokenFor(role, { otp = true } = {}) {
  seq += 1;
  const user = await models.User.create({ email: `${role}${seq}@example.com`, displayName: `${role} ${seq}`, role, emailVerifiedAt: new Date() });
  return `Bearer ${await signAccessToken(user, { sid: `sid-${seq}`, amr: otp ? ['pwd', 'otp'] : ['pwd'] })}`;
}

describe('conditions (real database)', () => {
  let app;
  let migrator;
  let admin;

  beforeAll(async () => {
    migrator = connectAsMigrator();
    app = createApp();
  });

  beforeEach(async () => {
    await resetTables(migrator);
    admin = await tokenFor('admin');
  });

  afterAll(async () => {
    await Promise.all([migrator.close(), closeDatabase()]);
  });

  const create = (body, auth = admin) => request(app).post('/api/v1/admin/conditions').set('Authorization', auth).send(body);

  describe('access', () => {
    it('needs a signed-in admin whose session passed 2FA', async () => {
      await request(app).get('/api/v1/admin/conditions').expect(401);
      const member = await request(app).get('/api/v1/admin/conditions').set('Authorization', await tokenFor('user')).expect(403);
      expect(member.body.error.code).toBe('FORBIDDEN');
      const noOtp = await request(app).get('/api/v1/admin/conditions').set('Authorization', await tokenFor('admin', { otp: false })).expect(403);
      expect(noOtp.body.error.code).toBe('MFA_REQUIRED');
    });
  });

  describe('create', () => {
    it('creates a condition with a web address made from the name, and audits it', async () => {
      const res = await create({ name: 'Lower Back Pain', summary: 'Posture and gentle asanas.', isPublished: true }).expect(201);
      expect(res.body.condition).toMatchObject({ name: 'Lower Back Pain', slug: 'lower-back-pain', isPublished: true, articleCount: 0 });
      const [actions] = await migrator.query(`SELECT action FROM \`${env.AUDIT_DB_NAME}\`.audit_logs`);
      expect(actions.map((a) => a.action)).toContain('condition.created');
    });

    it('explains duplicates under the right field', async () => {
      await create({ name: 'Migraine' }).expect(201);
      const sameName = await create({ name: 'migraine', slug: 'migraine-2' }).expect(409);
      expect(sameName.body.error).toMatchObject({ code: 'NAME_TAKEN', details: [{ path: 'name' }] });
      const sameSlug = await create({ name: 'Head pain', slug: 'migraine' }).expect(409);
      expect(sameSlug.body.error).toMatchObject({ code: 'SLUG_TAKEN', details: [{ path: 'slug' }] });
    });

    it('gives the specific duplicate message even when two admins create the same name at once', async () => {
      const results = await Promise.all([create({ name: 'Arthritis' }), create({ name: 'arthritis', slug: 'arthritis-2' })]);
      const statuses = results.map((r) => r.status).sort();
      expect(statuses).toEqual([201, 409]);
      const loser = results.find((r) => r.status === 409);
      expect(loser.body.error).toMatchObject({ code: 'NAME_TAKEN', details: [{ path: 'name' }] });
    });

    it('asks for a web address when the name has no English letters', async () => {
      const res = await create({ name: 'माइग्रेन' }).expect(400);
      expect(res.body.error).toMatchObject({ code: 'SLUG_REQUIRED', details: [{ path: 'slug' }] });
      await create({ name: 'माइग्रेन', slug: 'migraine-hi' }).expect(201);
    });

    it('says exactly what is wrong with bad input', async () => {
      const badSlug = await create({ name: 'Acidity', slug: 'Acidity Relief!' }).expect(400);
      expect(badSlug.body.error.details[0]).toMatchObject({ path: 'slug', message: expect.stringMatching(/lowercase letters, numbers and single hyphens/) });
      const long = await create({ name: 'Acidity', summary: 'x'.repeat(501) }).expect(400);
      expect(long.body.error.details[0].message).toBe('The summary has 501 characters. Keep it to 500.');
      const blank = await create({ name: '   ' }).expect(400);
      expect(blank.body.error.details[0].message).toMatch(/Enter a name/);
    });

    it('stores hostile-looking text as plain text (no SQL injection, no markup interpretation)', async () => {
      const sqlish = "Migraine'); DROP TABLE conditions; --";
      const scripty = '<img src=x onerror=alert(1)>';
      await create({ name: sqlish, slug: 'sqlish' }).expect(201);
      await create({ name: scripty, slug: 'scripty' }).expect(201);
      const list = await request(app).get('/api/v1/admin/conditions').set('Authorization', admin).expect(200);
      expect(list.body.items.map((c) => c.name)).toEqual(expect.arrayContaining([sqlish, scripty]));
      expect(list.headers['content-type']).toMatch(/application\/json/);
      const [[{ n }]] = await migrator.query('SELECT COUNT(*) AS n FROM conditions');
      expect(Number(n)).toBe(2); // the table is still there
    });

    it('rejects fields it does not know (no smuggling ids or timestamps)', async () => {
      await create({ name: 'Acidity', id: '00000000-0000-7000-8000-000000000000' }).expect(400);
      await create({ name: 'Acidity', createdAt: '2000-01-01' }).expect(400);
    });
  });

  describe('list, update, delete', () => {
    it('lists all for admins (with article counts) and only published ones for everyone', async () => {
      const shown = (await create({ name: 'Insomnia', isPublished: true }).expect(201)).body.condition;
      await create({ name: 'Hidden draft topic' }).expect(201);
      await models.Article.create({ conditionId: shown.id, title: 'Sleep well', slug: 'sleep-well' });

      const adminList = await request(app).get('/api/v1/admin/conditions').set('Authorization', admin).expect(200);
      expect(adminList.body.items.map((c) => c.name)).toEqual(['Hidden draft topic', 'Insomnia']);
      expect(adminList.body.items.find((c) => c.name === 'Insomnia').articleCount).toBe(1);

      const publicList = await request(app).get('/api/v1/conditions').expect(200);
      expect(publicList.body.items).toEqual([{ id: shown.id, name: 'Insomnia', slug: 'insomnia', summary: null }]);
      expect(publicList.headers['cache-control']).toMatch(/public/);
    });

    it('updates a condition and keeps names unique', async () => {
      const a = (await create({ name: 'Acidity' }).expect(201)).body.condition;
      await create({ name: 'Migraine' }).expect(201);
      const renamed = await request(app).patch(`/api/v1/admin/conditions/${a.id}`).set('Authorization', admin).send({ name: 'Acidity & Reflux', isPublished: true }).expect(200);
      expect(renamed.body.condition).toMatchObject({ name: 'Acidity & Reflux', slug: 'acidity', isPublished: true });
      const clash = await request(app).patch(`/api/v1/admin/conditions/${a.id}`).set('Authorization', admin).send({ name: 'Migraine' }).expect(409);
      expect(clash.body.error.code).toBe('NAME_TAKEN');
      // Saving its own name again is not a clash.
      await request(app).patch(`/api/v1/admin/conditions/${a.id}`).set('Authorization', admin).send({ name: 'Acidity & Reflux' }).expect(200);
    });

    it('answers 404 for a missing condition and 400 for a malformed id', async () => {
      await request(app).patch('/api/v1/admin/conditions/0190a1b2-c3d4-7000-8000-000000000999').set('Authorization', admin).send({ name: 'X' }).expect(404);
      await request(app).delete('/api/v1/admin/conditions/not-a-uuid').set('Authorization', admin).expect(400);
      await request(app).patch('/api/v1/admin/conditions/0190a1b2-c3d4-7000-8000-000000000999').set('Authorization', admin).send({}).expect(400);
    });

    it('refuses to delete a condition that articles use, and says how many', async () => {
      const c = (await create({ name: 'Insomnia' }).expect(201)).body.condition;
      await models.Article.create({ conditionId: c.id, title: 'Evening routine', slug: 'evening-routine' });
      await models.Article.create({ conditionId: c.id, title: 'Warm milk', slug: 'warm-milk' });
      const res = await request(app).delete(`/api/v1/admin/conditions/${c.id}`).set('Authorization', admin).expect(409);
      expect(res.body.error).toMatchObject({ code: 'CONDITION_IN_USE', message: '2 articles use this condition. Move them to another condition first.' });
    });

    it('deletes an unused condition; its name and web address can be reused afterwards', async () => {
      const c = (await create({ name: 'Insomnia', isPublished: true }).expect(201)).body.condition;
      await request(app).delete(`/api/v1/admin/conditions/${c.id}`).set('Authorization', admin).expect(204);
      expect((await request(app).get('/api/v1/conditions').expect(200)).body.items).toEqual([]);
      await create({ name: 'Insomnia' }).expect(201);
      const [actions] = await migrator.query(`SELECT action FROM \`${env.AUDIT_DB_NAME}\`.audit_logs WHERE action LIKE 'condition.%'`);
      expect(actions.map((a) => a.action)).toEqual(expect.arrayContaining(['condition.created', 'condition.deleted']));
    });
  });
});
