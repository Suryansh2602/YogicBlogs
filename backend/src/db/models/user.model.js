import { DataTypes, Model } from 'sequelize';
import { v7 as uuidv7 } from 'uuid';
import { ROLES, USER_STATUS } from '../../config/constants.js';

export class User extends Model {
  /** Never serialise credentials, even if a scope loaded them. */
  toJSON() {
    const { passwordHash: _passwordHash, ...safe } = super.toJSON();
    return safe;
  }

  get isAdmin() {
    return this.role === ROLES.ADMIN;
  }
}

export function initUser(sequelize) {
  User.init(
    {
      id: { type: DataTypes.UUID, primaryKey: true, defaultValue: () => uuidv7() },
      email: {
        type: DataTypes.STRING(254),
        allowNull: false,
        // Unique among non-deleted users (enforced in MySQL via the generated `alive` column).
        validate: { isEmail: true },
        set(value) {
          this.setDataValue('email', typeof value === 'string' ? value.trim().toLowerCase() : value);
        },
      },
      emailVerifiedAt: { type: DataTypes.DATE, allowNull: true },
      // Null for accounts that only sign in with Google.
      passwordHash: { type: DataTypes.STRING(255), allowNull: true },
      displayName: {
        type: DataTypes.STRING(80),
        allowNull: false,
        validate: { len: [1, 80] },
        set(value) {
          this.setDataValue('displayName', typeof value === 'string' ? value.trim() : value);
        },
      },
      avatarUrl: {
        type: DataTypes.STRING(2048),
        allowNull: true,
        validate: {
          isHttpsUrl(value) {
            if (value === null || value === undefined) return;
            let url;
            try {
              url = new URL(value);
            } catch {
              throw new Error('avatarUrl must be a valid URL');
            }
            if (url.protocol !== 'https:') throw new Error('avatarUrl must use https');
          },
        },
      },
      role: {
        type: DataTypes.STRING(32),
        allowNull: false,
        defaultValue: ROLES.USER,
        validate: { isIn: [Object.values(ROLES)] },
      },
      status: {
        type: DataTypes.STRING(16),
        allowNull: false,
        defaultValue: USER_STATUS.ACTIVE,
        validate: { isIn: [Object.values(USER_STATUS)] },
      },
      // Bumped to invalidate every issued access token (logout everywhere, password or role change).
      tokenVersion: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, defaultValue: 0 },
      lastLoginAt: { type: DataTypes.DATE, allowNull: true },
      passwordChangedAt: { type: DataTypes.DATE, allowNull: true },
    },
    {
      sequelize,
      modelName: 'User',
      tableName: 'users',
      paranoid: true,
      defaultScope: { attributes: { exclude: ['passwordHash'] } },
      scopes: { withPassword: { attributes: { include: ['passwordHash'] } } },
    },
  );
  return User;
}
