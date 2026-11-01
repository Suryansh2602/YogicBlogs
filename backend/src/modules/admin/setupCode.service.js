// The setup code: proves the server operator at /admin/setup (first admin) and /admin/recover.
// Which code counts:
//   1. the code set from the Admin panel (Admin → Security), stored hashed (argon2id) in admin_security;
//   2. otherwise ADMIN_SETUP_CODE from the server environment (the fallback);
//   3. otherwise, for first-time setup only, a temporary code printed to the server log.
// Changing or removing the panel code needs a signed-in admin's password and a fresh 2FA code; it applies
// at once. See docs/admin-recovery.md.
import { Op } from 'sequelize';
import { env } from '../../config/env.js';
import { models } from '../../config/db.js';
import { ApiError } from '../../utils/ApiError.js';
import { randomToken, safeEqual, sha256Hex } from '../../utils/crypto.js';
import { audit } from '../../services/audit.js';
import { hashPassword, verifyPassword } from '../auth/password.service.js';
import { verifyTotp } from '../auth/twoFactor.service.js';

const ROW_ID = 1;

// Generated once per process when no code is configured anywhere. Never logged except at startup.
let generatedCode;
export const temporaryCode = () => (generatedCode ??= randomToken(18));
export const forgetTemporaryCode = () => {
  generatedCode = undefined;
};

async function panelRow() {
  return models.AdminSecurity.scope('withHash').findByPk(ROW_ID);
}

/** Where the code that counts comes from: "panel", "env", or "none". */
export async function codeSource() {
  if ((await panelRow())?.setupCodeHash) return 'panel';
  return env.ADMIN_SETUP_CODE ? 'env' : 'none';
}

const equalConstantTime = (a, b) => safeEqual(sha256Hex(a), sha256Hex(b));

/**
 * Does the presented code match the code that counts? `allowTemporary` only for first-time setup.
 * Returns null when no code is configured at all (and no temporary code is allowed).
 */
export async function checkSetupCode(presented, { allowTemporary = false } = {}) {
  const row = await panelRow();
  if (row?.setupCodeHash) return verifyPassword(row.setupCodeHash, presented);
  if (env.ADMIN_SETUP_CODE) return equalConstantTime(presented, env.ADMIN_SETUP_CODE);
  if (allowTemporary) return equalConstantTime(presented, temporaryCode());
  return null;
}

/** Password and a fresh 2FA code of the signed-in admin; failures are audited. */
async function assertAdminProof(userId, { password, totpCode }, req) {
  // The password hash is hidden by default; only this check reads it.
  const user = await models.User.scope('withPassword').findByPk(userId);
  if (!user) throw ApiError.unauthorized('Please sign in again.', 'UNAUTHORIZED');
  if (!(await verifyPassword(user.passwordHash, password))) {
    await audit('admin.setup_code.change_failed', { req, actorId: user.id, metadata: { reason: 'password' } });
    throw ApiError.forbidden('Your password is not correct.', 'PASSWORD_INCORRECT');
  }
  if (!(await verifyTotp(user, totpCode))) {
    await audit('admin.setup_code.change_failed', { req, actorId: user.id, metadata: { reason: 'totp' } });
    throw ApiError.forbidden('The two-step sign-in code is not correct, or was already used. Enter the newest code from your app.', 'TOTP_INVALID');
  }
  return user;
}

async function describe() {
  const row = await models.AdminSecurity.findByPk(ROW_ID);
  const source = await codeSource();
  if (source !== 'panel' || !row) return { source, changedAt: null, changedBy: null };
  const by = row.setupCodeChangedBy ? await models.User.findByPk(row.setupCodeChangedBy, { attributes: ['displayName'] }) : null;
  return { source, changedAt: row.setupCodeChangedAt, changedBy: by?.displayName ?? null };
}

/** For the Security page: where the code comes from, and wrong codes tried in the last 24 hours. */
export async function securityOverview() {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const failedCodeAttempts24h = await models.AuditLog.count({
    where: { action: { [Op.in]: ['admin.recovery.failure', 'admin.setup.failure'] }, createdAt: { [Op.gte]: since } },
  });
  return { setupCode: await describe(), failedCodeAttempts24h };
}

export async function changeSetupCode(userId, { password, totpCode, newCode }, req) {
  const user = await assertAdminProof(userId, { password, totpCode }, req);
  if (newCode === password) throw ApiError.badRequest('Use a setup code that is different from your password.', [{ path: 'newCode', message: 'Use a setup code that is different from your password.' }], 'VALIDATION_FAILED');
  const values = { setupCodeHash: await hashPassword(newCode), setupCodeChangedBy: user.id, setupCodeChangedAt: new Date() };
  const [row] = await models.AdminSecurity.findOrCreate({ where: { id: ROW_ID }, defaults: { id: ROW_ID, ...values } });
  await row.update(values);
  forgetTemporaryCode();
  await audit('admin.setup_code.changed', { req, actorId: user.id, metadata: { source: 'panel' } });
  return { setupCode: await describe() };
}

export async function removePanelCode(userId, { password, totpCode }, req) {
  const user = await assertAdminProof(userId, { password, totpCode }, req);
  if (!env.ADMIN_SETUP_CODE) {
    throw ApiError.conflict('Set ADMIN_SETUP_CODE in backend/.env first: without a code, the admin account could not be recovered.', 'NO_FALLBACK');
  }
  await models.AdminSecurity.update({ setupCodeHash: null, setupCodeChangedBy: user.id, setupCodeChangedAt: new Date() }, { where: { id: ROW_ID } });
  await audit('admin.setup_code.removed', { req, actorId: user.id, metadata: { fallback: 'env' } });
  return { setupCode: await describe() };
}
