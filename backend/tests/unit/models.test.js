// Model rules that don't need a database: validation, defaults, serialisation, associations.
import { describe, expect, it } from 'vitest';
import { Sequelize } from 'sequelize';
import { initModels } from '../../src/db/models/index.js';

const sequelize = new Sequelize('mysql://u:p@localhost:3306/db', { logging: false, define: { underscored: true } });
const models = initModels(sequelize);
const { User, Article, Condition, Media, AuditLog, UserTwoFactor, RefreshToken } = models;

const validationErrors = async (instance) => {
  try {
    await instance.validate();
    return [];
  } catch (err) {
    // Field errors carry a path; model-level validators (e.g. publishedNeedsDate) only carry a message.
    return err.errors.map((e) => (e.path && e.path !== e.validatorKey ? e.path : e.message));
  }
};

describe('User model', () => {
  it('defaults to role "user", status "active", a UUID v7 id', () => {
    const user = User.build({ email: 'a@example.com', displayName: 'A' });
    expect(user.role).toBe('user');
    expect(user.status).toBe('active');
    expect(user.tokenVersion).toBe(0);
    expect(user.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });

  it('normalises email and trims the display name', () => {
    const user = User.build({ email: '  Mixed@Case.COM ', displayName: '  Asha  ' });
    expect(user.email).toBe('mixed@case.com');
    expect(user.displayName).toBe('Asha');
  });

  it('rejects an invalid email, an unknown role and an unknown status', async () => {
    const user = User.build({ email: 'nope', displayName: 'A', role: 'superuser', status: 'banned' });
    expect(await validationErrors(user)).toEqual(expect.arrayContaining(['email', 'role', 'status']));
  });

  it('only accepts https avatar URLs', async () => {
    const user = User.build({ email: 'a@example.com', displayName: 'A', avatarUrl: 'http://evil.example/x.png' });
    expect(await validationErrors(user)).toContain('avatarUrl');
  });

  it('never serialises the password hash', () => {
    const user = User.build({ email: 'a@example.com', displayName: 'A', passwordHash: '$argon2id$secret' });
    expect(JSON.stringify(user)).not.toContain('argon2');
    expect(user.toJSON()).not.toHaveProperty('passwordHash');
  });

  it('isAdmin reflects the role', () => {
    expect(User.build({ role: 'admin' }).isAdmin).toBe(true);
    expect(User.build({ role: 'user' }).isAdmin).toBe(false);
  });
});

describe('Article model', () => {
  const base = { conditionId: '01890000-0000-7000-8000-000000000000', title: 'Migraine care', slug: 'migraine-care' };

  it('defaults to a members-only draft at version 0', () => {
    const article = Article.build(base);
    expect(article.status).toBe('draft');
    expect(article.accessLevel).toBe('members');
    expect(Article.options.version).toBe(true);
    expect(article.isPublished).toBe(false);
  });

  it('requires a URL-safe slug', async () => {
    expect(await validationErrors(Article.build({ ...base, slug: 'Not A Slug!' }))).toContain('slug');
    expect(await validationErrors(Article.build({ ...base, slug: '<script>' }))).toContain('slug');
  });

  it('requires publishedAt when published', async () => {
    const errors = await validationErrors(Article.build({ ...base, status: 'published' }));
    expect(errors.join(' ')).toMatch(/publishedAt is required/);
  });

  it('is only "published" once its publish date has passed', () => {
    const future = Article.build({ ...base, status: 'published', publishedAt: new Date(Date.now() + 86_400_000) });
    const past = Article.build({ ...base, status: 'published', publishedAt: new Date(Date.now() - 1000) });
    expect(future.isPublished).toBe(false);
    expect(past.isPublished).toBe(true);
  });

  it('rejects unknown status and access level', async () => {
    const errors = await validationErrors(Article.build({ ...base, status: 'live', accessLevel: 'vip' }));
    expect(errors).toEqual(expect.arrayContaining(['status', 'accessLevel']));
  });
});

describe('other models', () => {
  it('Condition slug and Media kind are validated', async () => {
    expect(await validationErrors(Condition.build({ name: 'X', slug: 'Bad Slug' }))).toContain('slug');
    const media = Media.build({ kind: 'video', storageKey: 'k', mimeType: 'video/mp4', sizeBytes: 1, checksumSha256: 'x' });
    expect(await validationErrors(media)).toEqual(expect.arrayContaining(['kind', 'checksumSha256']));
  });

  it('AuditLog actions are lowercase dotted names', async () => {
    expect(await validationErrors(AuditLog.build({ action: 'auth.login.success' }))).toEqual([]);
    expect(await validationErrors(AuditLog.build({ action: 'DROP TABLE users' }))).toContain('action');
  });

  it('UserTwoFactor never serialises its encrypted secret', () => {
    const twoFactor = UserTwoFactor.build({ userId: 'u', secretEncrypted: 'iv.tag.ct' });
    expect(twoFactor.toJSON()).not.toHaveProperty('secretEncrypted');
  });

  it('RefreshToken.isActive is false once revoked, expired, or past the session hard limit', () => {
    const later = new Date(Date.now() + 60_000);
    expect(RefreshToken.build({ expiresAt: later, familyExpiresAt: later }).isActive).toBe(true);
    expect(RefreshToken.build({ expiresAt: later, familyExpiresAt: new Date(Date.now() - 1) }).isActive).toBe(false);
    expect(RefreshToken.build({ expiresAt: later, revokedAt: new Date() }).isActive).toBe(false);
    expect(RefreshToken.build({ expiresAt: new Date(Date.now() - 1) }).isActive).toBe(false);
  });

  it('UserConsent kinds and Media visibility are validated', async () => {
    const { UserConsent } = models;
    expect(await validationErrors(UserConsent.build({ userId: 'u', kind: 'cookies', version: 'v1', acceptedAt: new Date() }))).toContain('kind');
    expect(Media.build({}).visibility).toBe('protected');
  });

  it('token hashes must be 64-char hex', async () => {
    const token = RefreshToken.build({ userId: 'u', familyId: 'f', tokenHash: 'plain-token', expiresAt: new Date() });
    expect(await validationErrors(token)).toContain('tokenHash');
  });
});

describe('associations', () => {
  it('wires the expected relations', () => {
    expect(Object.keys(User.associations)).toEqual(
      expect.arrayContaining(['oauthAccounts', 'refreshTokens', 'twoFactor', 'backupCodes', 'authTokens', 'articles', 'bookmarkedArticles', 'readingProgress']),
    );
    expect(Object.keys(Article.associations)).toEqual(
      expect.arrayContaining(['condition', 'author', 'coverImage', 'audio', 'bookmarkedBy', 'readingProgress']),
    );
    expect(User.associations.refreshTokens.options.onDelete).toBe('CASCADE');
    expect(Condition.associations.articles.options.onDelete).toBe('RESTRICT');
  });
});
