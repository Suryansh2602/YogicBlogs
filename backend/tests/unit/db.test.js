import { describe, expect, it, vi } from 'vitest';
import { auditSequelize, closeDatabase, createSequelize, models, pingDatabase, sequelize } from '../../src/config/db.js';

describe('db', () => {
  it('configures Sequelize for MySQL with injection-safe, UTF-8, UTC settings', () => {
    const { options } = createSequelize();
    expect(options.dialect).toBe('mysql');
    expect(options.dialectOptions.multipleStatements).toBe(false);
    expect(options.dialectOptions.charset).toBe('utf8mb4');
    expect(options.dialectOptions.ssl).toBeUndefined(); // DB_SSL defaults to false
    expect(options.timezone).toBe('+00:00');
    expect(options.logging).toBe(false);
    expect(options.define.underscored).toBe(true);
  });

  it('uses the runtime user by default and accepts migrator credentials', () => {
    expect(createSequelize().config.username).toBe('test');
    expect(createSequelize({ username: 'migrator', password: 'pw' }).config.username).toBe('migrator');
  });

  it('registers every model on the shared instance', () => {
    expect(Object.keys(models).sort()).toEqual(
      [
        'Article',
        'ArticleBookmark',
        'ArticleDraft',
        'ArticleMedia',
        'ArticleReference',
        'ArticleRevision',
        'ArticleSlugRedirect',
        'AuditLog',
        'AuthToken',
        'Condition',
        'Media',
        'OAuthAccount',
        'ReadingProgress',
        'RefreshToken',
        'TwoFactorBackupCode',
        'User',
        'UserConsent',
        'UserTwoFactor',
      ].sort(),
    );
  });

  it('places the audit log on its own connection to the separate audit database', () => {
    expect(models.AuditLog.sequelize).toBe(auditSequelize);
    expect(auditSequelize.config.database).toBe('healthmarg_test_audit');
    expect(auditSequelize.options.pool.max).toBe(3);
  });

  it('pingDatabase() authenticates without logging', async () => {
    const spy = vi.spyOn(sequelize, 'authenticate').mockResolvedValue();
    await pingDatabase();
    expect(spy).toHaveBeenCalledWith({ logging: false });
  });

  it('pingDatabase() propagates connection failures', async () => {
    vi.spyOn(sequelize, 'authenticate').mockRejectedValue(new Error('ECONNREFUSED'));
    await expect(pingDatabase()).rejects.toThrow('ECONNREFUSED');
  });

  it('closeDatabase() closes both pools', async () => {
    const app = vi.spyOn(sequelize, 'close').mockResolvedValue();
    const audit = vi.spyOn(auditSequelize, 'close').mockResolvedValue();
    await closeDatabase();
    expect(app).toHaveBeenCalledOnce();
    expect(audit).toHaveBeenCalledOnce();
  });
});
