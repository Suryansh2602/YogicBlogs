import { models } from '../config/db.js';
import { logger } from '../utils/logger.js';

const clientIp = (req) => req?.ip ?? null;
const userAgent = (req) => req?.get?.('user-agent')?.slice(0, 512) ?? null;

/**
 * Append a security/admin event to the audit log (separate, append-only database).
 * Never throws: an audit write failure is logged loudly but must not break the user's request.
 * `metadata` must never contain passwords, tokens or codes.
 */
export async function audit(action, { req, actorId = null, entityType = null, entityId = null, metadata = null } = {}) {
  try {
    await models.AuditLog.create({
      action,
      actorId,
      entityType,
      entityId: entityId === null ? null : String(entityId),
      requestId: req?.id ?? null,
      ip: clientIp(req),
      userAgent: userAgent(req),
      metadata,
    });
  } catch (err) {
    logger.error({ err, action }, 'Audit log write failed');
  }
}
