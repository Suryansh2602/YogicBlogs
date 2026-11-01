// Admin panel data and the one-time bootstrap of the first admin account.
// There is no public admin sign-up: the first admin is created at /admin/setup with a setup code that only
// the server operator has (ADMIN_SETUP_CODE, or a random code printed to the server log at startup).
// Once any admin exists, setup is closed for good; further admins are promoted by an existing admin (later).
// The same code (when configured) also recovers an admin account: a forgotten email or password, a lost 2FA device.
import { Op } from 'sequelize';
import { env } from '../../config/env.js';
import { models, sequelize } from '../../config/db.js';
import { ROLES, USER_STATUS } from '../../config/constants.js';
import { ApiError } from '../../utils/ApiError.js';
import { logger } from '../../utils/logger.js';
import { audit } from '../../services/audit.js';
import { assertAcceptablePassword, publicUser } from '../auth/auth.service.js';
import { hashPassword } from '../auth/password.service.js';
import { revokeAllForUser } from '../auth/token.service.js';
import { invalidateUserState } from '../../middlewares/authenticate.js';
import { checkSetupCode, codeSource, forgetTemporaryCode, temporaryCode } from './setupCode.service.js';


export const adminExists = async () => (await models.User.count({ where: { role: ROLES.ADMIN } })) > 0;

/** At startup: if there is no admin yet, tell the operator (only the operator sees the server log). */
export async function announceAdminSetup() {
  if (await adminExists()) return;
  if ((await codeSource()) !== 'none') {
    logger.warn(`No admin yet. Create one at ${env.APP_URL}/admin/setup with the setup code (ADMIN_SETUP_CODE in the server environment).`);
  } else {
    // Development convenience; production deployments should set ADMIN_SETUP_CODE instead.
    logger.warn(`No admin yet. Create one at ${env.APP_URL}/admin/setup with this one-time setup code: ${temporaryCode()}`);
  }
}

export async function setupStatus() {
  return { setupRequired: !(await adminExists()) };
}

/** Create the first admin. Serialised with a MySQL named lock so two parallel requests can't both succeed. */
export async function createFirstAdmin({ setupCode: presented, email, password, displayName }, req) {
  // Constant-time (or argon2) comparison: see setupCode.service.js for which code counts.
  if (!(await checkSetupCode(presented, { allowTemporary: true }))) {
    await audit('admin.setup.failure', { req, metadata: { reason: 'bad_code' } });
    throw ApiError.forbidden('The setup code is not correct', 'SETUP_CODE_INVALID');
  }
  await assertAcceptablePassword(password, { email, displayName });
  const passwordHash = await hashPassword(password);

  const admin = await sequelize.transaction(async (transaction) => {
    const [lock] = await sequelize.query("SELECT GET_LOCK('healthmarg_admin_setup', 5) AS acquired", {
      type: sequelize.QueryTypes.SELECT,
      transaction,
    });
    if (lock?.acquired !== 1) throw ApiError.unavailable('Setup is busy. Please try again.');
    try {
      if ((await models.User.count({ where: { role: ROLES.ADMIN }, transaction })) > 0) {
        throw ApiError.conflict('Setup is already complete. Sign in at /admin.', 'SETUP_CLOSED');
      }
      if (await models.User.count({ where: { email }, transaction })) {
        throw ApiError.conflict('An account with this email already exists. Use a different email for the admin.', 'EMAIL_TAKEN');
      }
      // The operator holds the setup code, so the address is trusted; 2FA enrolment is forced at first sign-in.
      return await models.User.create(
        { email, displayName, passwordHash, role: ROLES.ADMIN, emailVerifiedAt: new Date() },
        { transaction },
      );
    } finally {
      await sequelize.query("SELECT RELEASE_LOCK('healthmarg_admin_setup')", { transaction });
    }
  });

  forgetTemporaryCode();
  await audit('admin.setup.created', { req, actorId: admin.id, entityType: 'user', entityId: admin.id });
  return { user: publicUser(admin) };
}

// ── Recovery: a forgotten email or password, or a lost 2FA device ───────────────────────────────
// Reusable, and proven by the setup code (the Admin panel's, else ADMIN_SETUP_CODE). Never by the
// temporary startup code: recovery must not depend on a code that disappears. It never creates an admin
// or changes a role. See docs/admin-recovery.md.

async function assertRecoveryCode(presented, req) {
  const matches = await checkSetupCode(presented);
  if (matches === null) {
    throw ApiError.unavailable('Recovery isn’t set up on this server. The operator must set ADMIN_SETUP_CODE in the server environment.', 'RECOVERY_NOT_CONFIGURED');
  }
  if (!matches) {
    await audit('admin.recovery.failure', { req, metadata: { reason: 'bad_code' } });
    throw ApiError.forbidden('The setup code is not correct', 'SETUP_CODE_INVALID');
  }
}

/** The admin accounts, with their emails, for whoever holds the setup code. */
export async function recoveryLookup({ setupCode: presented }, req) {
  await assertRecoveryCode(presented, req);
  const admins = await models.User.findAll({
    where: { role: ROLES.ADMIN },
    attributes: ['id', 'email', 'displayName'],
    order: [['createdAt', 'ASC']],
  });
  await audit('admin.recovery.lookup', { req, metadata: { admins: admins.length } });
  return { admins: admins.map((a) => ({ id: a.id, email: a.email, displayName: a.displayName })) };
}

/** New password, 2FA removed (set up again at the next sign-in), every session signed out, active again. */
export async function recoverAdmin({ setupCode: presented, adminId, password }, req) {
  await assertRecoveryCode(presented, req);
  const admin = await sequelize.transaction(async (transaction) => {
    const target = await models.User.findOne({ where: { id: adminId, role: ROLES.ADMIN }, transaction, lock: transaction.LOCK.UPDATE });
    if (!target) throw ApiError.notFound('No admin account has this ID.');
    await assertAcceptablePassword(password, { email: target.email, displayName: target.displayName });
    await models.UserTwoFactor.destroy({ where: { userId: target.id }, transaction });
    await models.TwoFactorBackupCode.destroy({ where: { userId: target.id }, transaction });
    await target.update(
      {
        passwordHash: await hashPassword(password),
        passwordChangedAt: new Date(),
        tokenVersion: target.tokenVersion + 1,
        status: USER_STATUS.ACTIVE,
      },
      { transaction },
    );
    await revokeAllForUser(target.id, 'admin_recovery', transaction);
    return target;
  });
  await invalidateUserState(admin.id);
  await audit('admin.recovery.completed', { req, actorId: admin.id, entityType: 'user', entityId: admin.id });
  return { email: admin.email };
}

// ── Admin panel ──────────────────────────────────────────────────────────────────────────────────

export async function stats() {
  const since = new Date(Date.now() - 7 * 24 * 3600_000);
  const [users, admins, verified, suspended, newThisWeek, activeThisWeek] = await Promise.all([
    models.User.count(),
    models.User.count({ where: { role: ROLES.ADMIN } }),
    models.User.count({ where: { emailVerifiedAt: { [Op.ne]: null } } }),
    models.User.count({ where: { status: USER_STATUS.SUSPENDED } }),
    models.User.count({ where: { createdAt: { [Op.gte]: since } } }),
    models.User.count({ where: { lastLoginAt: { [Op.gte]: since } } }),
  ]);
  return { users, admins, verified, suspended, newThisWeek, activeThisWeek };
}

const escapeLike = (value) => value.replace(/[\\%_]/g, (c) => `\\${c}`);

export async function listUsers({ page, pageSize, search, role }) {
  const where = {
    ...(role && { role }),
    ...(search && {
      [Op.or]: [
        { email: { [Op.like]: `%${escapeLike(search)}%` } },
        { displayName: { [Op.like]: `%${escapeLike(search)}%` } },
      ],
    }),
  };
  const { rows, count } = await models.User.findAndCountAll({
    where,
    attributes: ['id', 'email', 'displayName', 'role', 'status', 'emailVerifiedAt', 'lastLoginAt', 'createdAt'],
    order: [['createdAt', 'DESC']],
    limit: pageSize,
    offset: (page - 1) * pageSize,
  });
  return {
    items: rows.map((u) => ({
      id: u.id,
      email: u.email,
      displayName: u.displayName,
      role: u.role,
      status: u.status,
      emailVerified: Boolean(u.emailVerifiedAt),
      lastLoginAt: u.lastLoginAt,
      createdAt: u.createdAt,
    })),
    page,
    pageSize,
    total: count,
  };
}

export async function listAuditLogs({ page, pageSize, action }) {
  const { rows, count } = await models.AuditLog.findAndCountAll({
    where: action ? { action: { [Op.like]: `${escapeLike(action)}%` } } : {},
    attributes: ['id', 'action', 'actorId', 'entityType', 'entityId', 'ip', 'createdAt'],
    order: [['id', 'DESC']],
    limit: pageSize,
    offset: (page - 1) * pageSize,
  });
  // The audit log lives in another database (no join), so look the actors up in one extra query.
  // Deleted accounts are included: the log must still say who did something.
  const actorIds = [...new Set(rows.map((r) => r.actorId).filter(Boolean))];
  const actors = actorIds.length
    ? await models.User.findAll({ where: { id: actorIds }, attributes: ['id', 'email'], paranoid: false })
    : [];
  const emailById = new Map(actors.map((u) => [u.id, u.email]));
  return {
    items: rows.map((r) => ({ ...r.toJSON(), actorEmail: emailById.get(r.actorId) ?? null })),
    page,
    pageSize,
    total: count,
  };
}
