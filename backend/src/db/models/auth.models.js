// Authentication-related tables: OAuth links, refresh tokens (sessions), 2FA, one-time email tokens, consents.
// Every secret token is stored as a SHA-256/HMAC hash (CHAR(64)), never in plain text.
import { DataTypes, Model } from 'sequelize';
import { v7 as uuidv7 } from 'uuid';
import { AUTH_TOKEN_PURPOSE, CONSENT_KIND, OAUTH_PROVIDERS } from '../../config/constants.js';

const uuidPk = () => ({ type: DataTypes.UUID, primaryKey: true, defaultValue: () => uuidv7() });
const userFk = () => ({ type: DataTypes.UUID, allowNull: false });
const sha256Hex = () => ({ type: DataTypes.CHAR(64), allowNull: false, validate: { is: /^[a-f0-9]{64}$/ } });

export class OAuthAccount extends Model {}
export class RefreshToken extends Model {
  get isActive() {
    const now = new Date();
    return !this.revokedAt && this.expiresAt > now && (!this.familyExpiresAt || this.familyExpiresAt > now);
  }
}
export class UserTwoFactor extends Model {
  toJSON() {
    const { secretEncrypted: _secret, ...safe } = super.toJSON();
    return safe;
  }
}
export class TwoFactorBackupCode extends Model {}
export class AuthToken extends Model {}
export class UserConsent extends Model {}

export function initAuthModels(sequelize) {
  OAuthAccount.init(
    {
      id: uuidPk(),
      userId: userFk(),
      provider: { type: DataTypes.STRING(32), allowNull: false, validate: { isIn: [Object.values(OAUTH_PROVIDERS)] } },
      // Google "sub" claim: stable per user, unlike email.
      providerUserId: { type: DataTypes.STRING(255), allowNull: false },
      email: { type: DataTypes.STRING(254), allowNull: true, validate: { isEmail: true } },
    },
    {
      sequelize,
      modelName: 'OAuthAccount',
      tableName: 'oauth_accounts',
      indexes: [
        { unique: true, fields: ['provider', 'provider_user_id'] },
        { unique: true, fields: ['user_id', 'provider'] },
      ],
    },
  );

  RefreshToken.init(
    {
      id: uuidPk(),
      userId: userFk(),
      // All tokens from one login share a family (= one session). Reuse of a rotated token revokes the family.
      familyId: { type: DataTypes.UUID, allowNull: false },
      tokenHash: { ...sha256Hex(), unique: true },
      expiresAt: { type: DataTypes.DATE, allowNull: false },
      // Hard end of the whole session: rotation can never extend a login past this.
      familyExpiresAt: { type: DataTypes.DATE, allowNull: false },
      // How the session was authenticated, e.g. 'pwd', 'pwd+otp', 'google'.
      amr: { type: DataTypes.STRING(32), allowNull: true },
      revokedAt: { type: DataTypes.DATE, allowNull: true },
      revokedReason: { type: DataTypes.STRING(32), allowNull: true },
      replacedById: { type: DataTypes.UUID, allowNull: true },
      ip: { type: DataTypes.STRING(45), allowNull: true },
      userAgent: { type: DataTypes.STRING(512), allowNull: true },
    },
    {
      sequelize,
      modelName: 'RefreshToken',
      tableName: 'refresh_tokens',
      indexes: [{ fields: ['user_id'] }, { fields: ['family_id'] }, { fields: ['expires_at'] }],
    },
  );

  UserTwoFactor.init(
    {
      userId: { type: DataTypes.UUID, primaryKey: true },
      // AES-256-GCM ciphertext of the TOTP secret ("v1.iv.tag.ciphertext", base64url, AAD = user id).
      // The key lives in env only.
      secretEncrypted: { type: DataTypes.STRING(512), allowNull: false },
      // Null while enrolment is pending (secret issued but first code not yet confirmed).
      enabledAt: { type: DataTypes.DATE, allowNull: true },
      // Last accepted TOTP time-step, so a code can't be replayed inside its 30 s window.
      lastUsedStep: { type: DataTypes.BIGINT.UNSIGNED, allowNull: true },
    },
    {
      sequelize,
      modelName: 'UserTwoFactor',
      tableName: 'user_two_factor',
      defaultScope: { attributes: { exclude: ['secretEncrypted'] } },
      scopes: { withSecret: { attributes: { include: ['secretEncrypted'] } } },
    },
  );

  TwoFactorBackupCode.init(
    {
      id: uuidPk(),
      userId: userFk(),
      codeHash: sha256Hex(),
      usedAt: { type: DataTypes.DATE, allowNull: true },
    },
    {
      sequelize,
      modelName: 'TwoFactorBackupCode',
      tableName: 'two_factor_backup_codes',
      updatedAt: false,
      indexes: [{ fields: ['user_id'] }],
    },
  );

  AuthToken.init(
    {
      id: uuidPk(),
      userId: userFk(),
      purpose: { type: DataTypes.STRING(32), allowNull: false, validate: { isIn: [Object.values(AUTH_TOKEN_PURPOSE)] } },
      tokenHash: { ...sha256Hex(), unique: true },
      // Only for purpose=email_change: the address being confirmed.
      newEmail: { type: DataTypes.STRING(254), allowNull: true, validate: { isEmail: true } },
      expiresAt: { type: DataTypes.DATE, allowNull: false },
      usedAt: { type: DataTypes.DATE, allowNull: true },
    },
    {
      sequelize,
      modelName: 'AuthToken',
      tableName: 'auth_tokens',
      updatedAt: false,
      indexes: [{ fields: ['user_id', 'purpose'] }],
    },
  );

  UserConsent.init(
    {
      id: uuidPk(),
      userId: userFk(),
      kind: { type: DataTypes.STRING(32), allowNull: false, validate: { isIn: [Object.values(CONSENT_KIND)] } },
      // Version of the document accepted, e.g. '2026-10-25'.
      version: { type: DataTypes.STRING(20), allowNull: false },
      acceptedAt: { type: DataTypes.DATE, allowNull: false },
      withdrawnAt: { type: DataTypes.DATE, allowNull: true },
      ip: { type: DataTypes.STRING(45), allowNull: true },
    },
    {
      sequelize,
      modelName: 'UserConsent',
      tableName: 'user_consents',
      indexes: [{ fields: ['user_id', 'kind'] }],
    },
  );

  return { OAuthAccount, RefreshToken, UserTwoFactor, TwoFactorBackupCode, AuthToken, UserConsent };
}
