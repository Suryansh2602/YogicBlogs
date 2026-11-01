import { DataTypes, Model } from 'sequelize';

/** Admin security settings (one row, id = 1): the setup code set from the Admin panel, hashed. */
export class AdminSecurity extends Model {}

export function initAdminSecurity(sequelize) {
  AdminSecurity.init(
    {
      id: { type: DataTypes.TINYINT.UNSIGNED, primaryKey: true, defaultValue: 1 },
      setupCodeHash: { type: DataTypes.STRING(255), allowNull: true },
      setupCodeChangedBy: { type: DataTypes.CHAR(36), allowNull: true },
      setupCodeChangedAt: { type: DataTypes.DATE, allowNull: true },
    },
    {
      sequelize,
      modelName: 'AdminSecurity',
      tableName: 'admin_security',
      // Never sent anywhere by accident.
      defaultScope: { attributes: { exclude: ['setupCodeHash'] } },
      scopes: { withHash: { attributes: { include: ['setupCodeHash'] } } },
    },
  );
  return AdminSecurity;
}
