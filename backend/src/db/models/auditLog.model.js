import { DataTypes, Model } from 'sequelize';

/**
 * Append-only record of security-relevant and admin actions.
 * Lives in its own database (AUDIT_DB_NAME) where the app user only has INSERT and SELECT,
 * so even a compromised app can't edit or erase the trail. No foreign key to users on purpose:
 * entries keep the actor's id even after that user is erased.
 */
export class AuditLog extends Model {}

export function initAuditLog(sequelize, { schema } = {}) {
  AuditLog.init(
    {
      id: { type: DataTypes.BIGINT.UNSIGNED, primaryKey: true, autoIncrement: true },
      actorId: { type: DataTypes.UUID, allowNull: true },
      // e.g. auth.login.success, auth.2fa.enabled, article.published, user.role.changed
      action: { type: DataTypes.STRING(64), allowNull: false, validate: { is: /^[a-z0-9_.]+$/ } },
      entityType: { type: DataTypes.STRING(64), allowNull: true },
      entityId: { type: DataTypes.STRING(64), allowNull: true },
      requestId: { type: DataTypes.STRING(64), allowNull: true },
      ip: { type: DataTypes.STRING(45), allowNull: true },
      userAgent: { type: DataTypes.STRING(512), allowNull: true },
      // Context only: never passwords, tokens or full request bodies.
      metadata: { type: DataTypes.JSON, allowNull: true },
    },
    {
      sequelize,
      modelName: 'AuditLog',
      tableName: 'audit_logs',
      ...(schema && { schema }),
      updatedAt: false,
      indexes: [{ fields: ['actor_id', 'created_at'] }, { fields: ['entity_type', 'entity_id'] }, { fields: ['action', 'created_at'] }],
    },
  );
  return AuditLog;
}
