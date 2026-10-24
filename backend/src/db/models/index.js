import { initUser } from './user.model.js';
import { initAuthModels } from './auth.models.js';
import { initContentModels } from './content.models.js';
import { initAuditLog } from './auditLog.model.js';

/**
 * Register every model on a Sequelize instance and wire the associations.
 * Kept as a function (not import side effects) so tests can build models on their own instance.
 */
export function initModels(sequelize, { auditSequelize = sequelize } = {}) {
  const User = initUser(sequelize);
  const auth = initAuthModels(sequelize);
  const content = initContentModels(sequelize);
  const AuditLog = initAuditLog(auditSequelize);

  const { OAuthAccount, RefreshToken, UserTwoFactor, TwoFactorBackupCode, AuthToken, UserConsent } = auth;
  const { Condition, Media, Article, ArticleBookmark, ReadingProgress } = content;

  // Auth: owned by the user, removed with it.
  const owned = { foreignKey: 'userId', onDelete: 'CASCADE' };
  User.hasMany(OAuthAccount, { as: 'oauthAccounts', ...owned });
  OAuthAccount.belongsTo(User, { as: 'user', foreignKey: 'userId' });
  User.hasMany(RefreshToken, { as: 'refreshTokens', ...owned });
  RefreshToken.belongsTo(User, { as: 'user', foreignKey: 'userId' });
  User.hasOne(UserTwoFactor, { as: 'twoFactor', ...owned });
  UserTwoFactor.belongsTo(User, { as: 'user', foreignKey: 'userId' });
  User.hasMany(TwoFactorBackupCode, { as: 'backupCodes', ...owned });
  TwoFactorBackupCode.belongsTo(User, { as: 'user', foreignKey: 'userId' });
  User.hasMany(AuthToken, { as: 'authTokens', ...owned });
  AuthToken.belongsTo(User, { as: 'user', foreignKey: 'userId' });
  User.hasMany(UserConsent, { as: 'consents', ...owned });
  UserConsent.belongsTo(User, { as: 'user', foreignKey: 'userId' });

  // Content.
  Condition.hasMany(Article, { as: 'articles', foreignKey: 'conditionId', onDelete: 'RESTRICT' });
  Article.belongsTo(Condition, { as: 'condition', foreignKey: 'conditionId' });
  User.hasMany(Article, { as: 'articles', foreignKey: 'authorId', onDelete: 'SET NULL' });
  Article.belongsTo(User, { as: 'author', foreignKey: 'authorId' });
  Article.belongsTo(Media, { as: 'coverImage', foreignKey: 'coverImageId', onDelete: 'SET NULL' });
  Article.belongsTo(Media, { as: 'audio', foreignKey: 'audioId', onDelete: 'SET NULL' });
  Condition.belongsTo(Media, { as: 'heroImage', foreignKey: 'heroImageId', onDelete: 'SET NULL' });
  User.hasMany(Media, { as: 'uploads', foreignKey: 'uploadedById', onDelete: 'SET NULL' });
  Media.belongsTo(User, { as: 'uploadedBy', foreignKey: 'uploadedById' });

  // User dashboard data.
  User.belongsToMany(Article, { through: ArticleBookmark, as: 'bookmarkedArticles', foreignKey: 'userId', otherKey: 'articleId' });
  Article.belongsToMany(User, { through: ArticleBookmark, as: 'bookmarkedBy', foreignKey: 'articleId', otherKey: 'userId' });
  User.hasMany(ReadingProgress, { as: 'readingProgress', ...owned });
  ReadingProgress.belongsTo(User, { as: 'user', foreignKey: 'userId' });
  Article.hasMany(ReadingProgress, { as: 'readingProgress', foreignKey: 'articleId', onDelete: 'CASCADE' });
  ReadingProgress.belongsTo(Article, { as: 'article', foreignKey: 'articleId' });

  // AuditLog has no association: it lives in a separate database (own connection) and entries must
  // outlive the users they mention. Look actors up by actorId when displaying the log.

  return { User, AuditLog, ...auth, ...content };
}
