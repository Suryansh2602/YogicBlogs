import { createHash } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { ForeignKeyConstraintError, OptimisticLockError, UniqueConstraintError } from 'sequelize';
import { connectAsApp, connectAsMigrator, inOneMinute, makeCondition, makeUser, resetTables } from './helpers.js';

const sha = (value) => createHash('sha256').update(value).digest('hex');

describe('models against MySQL', () => {
  let sequelize;
  let models;
  let migrator;

  beforeAll(() => {
    ({ sequelize, models } = connectAsApp());
    migrator = connectAsMigrator();
  });

  beforeEach(async () => {
    await resetTables(migrator);
  });

  afterAll(async () => {
    await Promise.all([sequelize.close(), migrator.close()]);
  });

  const refreshToken = (user, hashSeed) => ({
    userId: user.id,
    familyId: user.id,
    tokenHash: sha(hashSeed),
    expiresAt: inOneMinute(),
    familyExpiresAt: inOneMinute(),
  });

  describe('users', () => {
    it('stores a normalised email and a time-ordered UUID', async () => {
      const user = await makeUser(models, { email: '  Asha@Example.COM ' });
      expect(user.email).toBe('asha@example.com');
      expect(user.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-/);
      expect(user.role).toBe('user');
    });

    it('enforces unique email (case-insensitively, via normalisation)', async () => {
      await makeUser(models, { email: 'same@example.com' });
      await expect(makeUser(models, { email: 'SAME@example.com' })).rejects.toBeInstanceOf(UniqueConstraintError);
    });

    it('frees the email again after a soft delete', async () => {
      const first = await makeUser(models, { email: 'reuse@example.com' });
      await first.destroy();
      await expect(makeUser(models, { email: 'reuse@example.com' })).resolves.toBeDefined();
    });

    it('never returns the password hash by default', async () => {
      const created = await makeUser(models, { passwordHash: '$argon2id$fake' });
      const loaded = await models.User.findByPk(created.id);
      expect(loaded.passwordHash).toBeUndefined();

      const withPassword = await models.User.scope('withPassword').findByPk(created.id);
      expect(withPassword.passwordHash).toBe('$argon2id$fake');
      expect(JSON.stringify(withPassword)).not.toContain('argon2');
    });

    it('soft-deletes users', async () => {
      const user = await makeUser(models);
      await user.destroy();
      expect(await models.User.findByPk(user.id)).toBeNull();
      expect(await models.User.findByPk(user.id, { paranoid: false })).not.toBeNull();
    });
  });

  describe('auth tables', () => {
    it('removes a user’s sessions, 2FA data and consents when the user row is erased', async () => {
      const user = await makeUser(models);
      await models.RefreshToken.create(refreshToken(user, 'refresh'));
      await models.UserTwoFactor.create({ userId: user.id, secretEncrypted: 'v1.iv.tag.ciphertext' });
      await models.TwoFactorBackupCode.create({ userId: user.id, codeHash: sha('backup') });
      await models.UserConsent.create({ userId: user.id, kind: 'terms', version: '2026-10-25', acceptedAt: new Date() });

      await user.destroy({ force: true });

      expect(await models.RefreshToken.count()).toBe(0);
      expect(await models.UserTwoFactor.count()).toBe(0);
      expect(await models.TwoFactorBackupCode.count()).toBe(0);
      expect(await models.UserConsent.count()).toBe(0);
    });

    it('keeps refresh token hashes unique', async () => {
      const user = await makeUser(models);
      await models.RefreshToken.create(refreshToken(user, 'dup'));
      await expect(models.RefreshToken.create(refreshToken(user, 'dup'))).rejects.toBeInstanceOf(UniqueConstraintError);
    });

    it('allows one Google account per user and per Google identity', async () => {
      const user = await makeUser(models);
      await models.OAuthAccount.create({ userId: user.id, provider: 'google', providerUserId: 'g-123' });
      const other = await makeUser(models);
      await expect(
        models.OAuthAccount.create({ userId: other.id, provider: 'google', providerUserId: 'g-123' }),
      ).rejects.toBeInstanceOf(UniqueConstraintError);
    });

    it('hides the encrypted 2FA secret unless explicitly requested', async () => {
      const user = await makeUser(models);
      await models.UserTwoFactor.create({ userId: user.id, secretEncrypted: 'v1.iv.tag.ciphertext' });
      expect((await models.UserTwoFactor.findByPk(user.id)).secretEncrypted).toBeUndefined();
      expect((await models.UserTwoFactor.scope('withSecret').findByPk(user.id)).secretEncrypted).toBe('v1.iv.tag.ciphertext');
    });
  });

  describe('content', () => {
    it('creates an article linked to its condition, author and media', async () => {
      const author = await makeUser(models, { role: 'admin' });
      const condition = await makeCondition(models);
      const cover = await models.Media.create({
        uploadedById: author.id,
        kind: 'image',
        visibility: 'public',
        storageKey: 'images/cover.webp',
        mimeType: 'image/webp',
        sizeBytes: 1024,
        checksumSha256: sha('cover'),
      });
      const article = await models.Article.create({
        conditionId: condition.id,
        authorId: author.id,
        coverImageId: cover.id,
        title: 'Calming migraine',
        slug: 'calming-migraine',
        contentJson: { type: 'doc', content: [] },
        status: 'published',
        publishedAt: new Date(Date.now() - 1000),
      });

      const loaded = await models.Article.findByPk(article.id, { include: ['condition', 'author', 'coverImage'] });
      expect(loaded.condition.id).toBe(condition.id);
      expect(loaded.author.id).toBe(author.id);
      expect(loaded.coverImage.storageKey).toBe('images/cover.webp');
      expect(loaded.contentJson).toEqual({ type: 'doc', content: [] });
      expect(loaded.accessLevel).toBe('members');
      expect(loaded.isPublished).toBe(true);
    });

    it('frees an article slug after a soft delete, but not while it is live', async () => {
      const condition = await makeCondition(models);
      const first = await models.Article.create({ conditionId: condition.id, title: 'Sleep', slug: 'sleep' });
      await expect(
        models.Article.create({ conditionId: condition.id, title: 'Sleep again', slug: 'sleep' }),
      ).rejects.toBeInstanceOf(UniqueConstraintError);
      await first.destroy();
      await expect(models.Article.create({ conditionId: condition.id, title: 'Sleep v2', slug: 'sleep' })).resolves.toBeDefined();
    });

    it('rejects a stale save from a second editor (optimistic locking)', async () => {
      const condition = await makeCondition(models);
      const created = await models.Article.create({ conditionId: condition.id, title: 'Draft', slug: 'draft' });
      const editorA = await models.Article.findByPk(created.id);
      const editorB = await models.Article.findByPk(created.id);

      editorA.title = 'Edited by A';
      await editorA.save();
      editorB.title = 'Edited by B';
      await expect(editorB.save()).rejects.toBeInstanceOf(OptimisticLockError);
    });

    it('refuses to delete a condition that still has articles', async () => {
      const condition = await makeCondition(models);
      await models.Article.create({ conditionId: condition.id, title: 'Article', slug: 'article' });
      await expect(condition.destroy({ force: true })).rejects.toBeInstanceOf(ForeignKeyConstraintError);
    });

    it('rejects an article for a condition that does not exist', async () => {
      await expect(
        models.Article.create({ conditionId: '01890000-0000-7000-8000-000000000000', title: 'Orphan', slug: 'orphan' }),
      ).rejects.toBeInstanceOf(ForeignKeyConstraintError);
    });

    it('tracks bookmarks and reading progress for the user dashboard', async () => {
      const user = await makeUser(models);
      const condition = await makeCondition(models);
      const article = await models.Article.create({ conditionId: condition.id, title: 'Sleep well', slug: 'sleep-well' });

      await user.addBookmarkedArticle(article);
      await models.ReadingProgress.create({ userId: user.id, articleId: article.id, progressPercent: 40 });

      expect((await user.getBookmarkedArticles()).map((a) => a.id)).toEqual([article.id]);
      const [progress] = await user.getReadingProgress();
      expect(progress.progressPercent).toBe(40);
    });
  });

  describe('audit log', () => {
    it('writes to the separate audit database and keeps entries after the actor is erased', async () => {
      const actor = await makeUser(models);
      const entry = await models.AuditLog.create({
        actorId: actor.id,
        action: 'article.published',
        entityType: 'article',
        entityId: 'abc',
        requestId: 'req-1',
        metadata: { slug: 'calming-migraine' },
      });
      await actor.destroy({ force: true });

      const reloaded = await models.AuditLog.findByPk(entry.id);
      expect(reloaded.actorId).toBe(actor.id);
      expect(reloaded.metadata).toEqual({ slug: 'calming-migraine' });
    });
  });
});
