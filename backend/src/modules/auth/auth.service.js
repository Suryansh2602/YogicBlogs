// Authentication flows. Security rules applied throughout:
// - Never reveal whether an email is registered (register / resend / forgot always answer 202;
//   login gives one message for "no such user" and "wrong password", with equalised timing).
// - Secrets are stored hashed; raw tokens exist only in the email link or cookie.
// - Admins must pass a second factor; their first login forces 2FA enrolment.
import { Op, UniqueConstraintError } from 'sequelize';
import { models, sequelize } from '../../config/db.js';
import { AUTH_TOKEN_PURPOSE, CONSENT_KIND, ROLES, USER_STATUS } from '../../config/constants.js';
import { ApiError } from '../../utils/ApiError.js';
import { ephemeralStore } from '../../utils/ephemeralStore.js';
import { randomToken, sha256Hex } from '../../utils/crypto.js';
import { appLink, sendMail } from '../../services/mailer.js';
import { audit } from '../../services/audit.js';
import { invalidateUserState, revokedSessionKey } from '../../middlewares/authenticate.js';
import {
  burnPasswordCheck,
  hashPassword,
  breachCount,
  needsRehash,
  passwordProblems,
  verifyPassword,
} from './password.service.js';
import {
  findActiveFamily,
  issueRefreshToken,
  revokeAllForUser,
  revokeFamily,
  rotateRefreshToken,
  signAccessToken,
} from './token.service.js';
import { lockout } from './lockout.service.js';
import * as twoFactor from './twoFactor.service.js';

export const POLICY_VERSION = '2026-10-25';
const EMAIL_TOKEN_TTL_MS = { [AUTH_TOKEN_PURPOSE.EMAIL_VERIFICATION]: 24 * 3600_000, [AUTH_TOKEN_PURPOSE.PASSWORD_RESET]: 3600_000 };
const MFA_TICKET_TTL_SECONDS = 5 * 60;
const MFA_MAX_ATTEMPTS = 5;
// Deliberately the same for an unknown email and a wrong password, so nobody can test which emails have accounts.
const WRONG_CREDENTIALS = 'The email or password is incorrect. Check both and try again.';

/** What the client may see about a user. */
export function publicUser(user, { twoFactorEnabled = false } = {}) {
  return {
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    role: user.role,
    avatarUrl: user.avatarUrl ?? null,
    emailVerified: Boolean(user.emailVerifiedAt),
    twoFactorEnabled,
    createdAt: user.createdAt,
  };
}

export async function assertAcceptablePassword(password, { email, displayName }) {
  const problems = passwordProblems(password, { email, displayName });
  if (problems.length) {
    throw ApiError.badRequest(problems[0], problems.map((message) => ({ path: 'password', message })), 'WEAK_PASSWORD');
  }
  const breaches = await breachCount(password);
  if (breaches > 0) {
    const message = `This password has appeared ${breaches.toLocaleString('en-IN')} time${breaches === 1 ? '' : 's'} in leaked password lists, so attackers try it early. Choose a different one.`;
    throw ApiError.badRequest(message, [{ path: 'password', message }], 'BREACHED_PASSWORD');
  }
}

/** One-time email token: invalidates earlier unused ones of the same purpose, returns the raw token. */
async function createEmailToken(userId, purpose, transaction, extra = {}) {
  await models.AuthToken.update({ usedAt: new Date() }, { where: { userId, purpose, usedAt: null }, transaction });
  const raw = randomToken(32);
  await models.AuthToken.create(
    { userId, purpose, tokenHash: sha256Hex(raw), expiresAt: new Date(Date.now() + EMAIL_TOKEN_TTL_MS[purpose]), ...extra },
    { transaction },
  );
  return raw;
}

/** Consume a one-time email token (single use, unexpired, right purpose) inside a transaction. */
async function consumeEmailToken(raw, purpose, transaction) {
  const row = await models.AuthToken.findOne({
    where: { tokenHash: sha256Hex(raw), purpose, usedAt: null, expiresAt: { [Op.gt]: new Date() } },
    lock: transaction.LOCK.UPDATE,
    transaction,
  });
  if (!row) throw ApiError.badRequest('This link is invalid or has expired. Please request a new one.', undefined, 'INVALID_TOKEN');
  await row.update({ usedAt: new Date() }, { transaction });
  return row;
}

// ── Registration & email verification ────────────────────────────────────────────────────────────

export async function register({ email, password, displayName }, req) {
  await assertAcceptablePassword(password, { email, displayName });
  const existing = await models.User.findOne({ where: { email } });

  if (existing) {
    // Same work and same answer as a fresh sign-up, so the response can't reveal registered emails.
    await hashPassword(password);
    if (existing.emailVerifiedAt) {
      sendMail('alreadyRegistered', existing.email, { name: existing.displayName, url: appLink('/signin') });
    } else {
      const raw = await sequelize.transaction((t) => createEmailToken(existing.id, AUTH_TOKEN_PURPOSE.EMAIL_VERIFICATION, t));
      sendMail('verifyEmail', existing.email, { name: existing.displayName, url: appLink('/verify-email', { token: raw }) });
    }
    await audit('auth.register.duplicate', { req, actorId: existing.id, entityType: 'user', entityId: existing.id });
    return;
  }

  const passwordHash = await hashPassword(password);
  let created;
  try {
    created = await createAccount({ email, displayName, passwordHash }, req);
  } catch (err) {
    // Two sign-ups for the same new email at the same instant: the loser must still get the plain 202,
    // or the 409 would reveal that the address is registered.
    if (err instanceof UniqueConstraintError) {
      await audit('auth.register.duplicate', { req, metadata: { race: true } });
      return;
    }
    throw err;
  }
  sendMail('verifyEmail', created.user.email, { name: created.user.displayName, url: appLink('/verify-email', { token: created.raw }) });
  await audit('auth.register', { req, actorId: created.user.id, entityType: 'user', entityId: created.user.id });
}

function createAccount({ email, displayName, passwordHash }, req) {
  return sequelize.transaction(async (transaction) => {
    const created = await models.User.create({ email, displayName, passwordHash }, { transaction });
    const now = new Date();
    await models.UserConsent.bulkCreate(
      [CONSENT_KIND.TERMS, CONSENT_KIND.PRIVACY].map((kind) => ({
        userId: created.id,
        kind,
        version: POLICY_VERSION,
        acceptedAt: now,
        ip: req.ip ?? null,
      })),
      { transaction },
    );
    const token = await createEmailToken(created.id, AUTH_TOKEN_PURPOSE.EMAIL_VERIFICATION, transaction);
    return { user: created, raw: token };
  });
}

export async function verifyEmail(raw, req) {
  const userId = await sequelize.transaction(async (transaction) => {
    const token = await consumeEmailToken(raw, AUTH_TOKEN_PURPOSE.EMAIL_VERIFICATION, transaction);
    await models.User.update({ emailVerifiedAt: new Date() }, { where: { id: token.userId, emailVerifiedAt: null }, transaction });
    return token.userId;
  });
  await audit('auth.email.verified', { req, actorId: userId, entityType: 'user', entityId: userId });
}

export async function resendVerification(email, req) {
  const user = await models.User.findOne({ where: { email } });
  if (!user || user.emailVerifiedAt) return;
  const raw = await sequelize.transaction((t) => createEmailToken(user.id, AUTH_TOKEN_PURPOSE.EMAIL_VERIFICATION, t));
  sendMail('verifyEmail', user.email, { name: user.displayName, url: appLink('/verify-email', { token: raw }) });
  await audit('auth.email.resend', { req, actorId: user.id, entityType: 'user', entityId: user.id });
}

// ── Login ────────────────────────────────────────────────────────────────────────────────────────

const ticketKey = (ticket) => `auth:mfa:${sha256Hex(ticket)}`;

async function createMfaTicket(user, mode) {
  const ticket = randomToken(32);
  await ephemeralStore.set(ticketKey(ticket), JSON.stringify({ userId: user.id, mode, attempts: 0 }), MFA_TICKET_TTL_SECONDS);
  return ticket;
}

async function readMfaTicket(ticket, expectedMode) {
  const raw = await ephemeralStore.get(ticketKey(ticket));
  const data = raw ? JSON.parse(raw) : null;
  if (!data || data.mode !== expectedMode) {
    throw ApiError.unauthorized('Your sign-in attempt expired. Please sign in again.', 'MFA_TICKET_INVALID');
  }
  return data;
}

async function failMfaAttempt(ticket, data) {
  const attempts = data.attempts + 1;
  if (attempts >= MFA_MAX_ATTEMPTS) {
    await ephemeralStore.del(ticketKey(ticket));
    throw ApiError.unauthorized(`That was the ${MFA_MAX_ATTEMPTS}th wrong code, so this sign-in was stopped. Please sign in again.`, 'MFA_TICKET_INVALID');
  }
  const ttl = Math.max(await ephemeralStore.ttl(ticketKey(ticket)), 1);
  await ephemeralStore.set(ticketKey(ticket), JSON.stringify({ ...data, attempts }), ttl);
  const left = MFA_MAX_ATTEMPTS - attempts;
  throw ApiError.unauthorized(
    `That code didn’t match. Codes change every 30 seconds, so enter the one your app shows now. ${left} ${left === 1 ? 'try' : 'tries'} left.`,
    'INVALID_CODE',
  );
}

/** Issue the session: access token in the body, refresh token as an HttpOnly cookie (set by the route). */
async function completeLogin(user, amr, req) {
  const { raw, row } = await issueRefreshToken(user, { amr, req });
  await models.User.update({ lastLoginAt: new Date() }, { where: { id: user.id } });
  const accessToken = await signAccessToken(user, { sid: row.familyId, amr });
  await audit('auth.login.success', { req, actorId: user.id, entityType: 'user', entityId: user.id, metadata: { amr } });
  return {
    accessToken,
    user: publicUser(user, { twoFactorEnabled: amr.includes('otp') || (await twoFactor.isEnabled(user.id)) }),
    refresh: { raw, expiresAt: row.expiresAt },
  };
}

/**
 * Password step. Returns either a finished session, or an MFA ticket:
 *  - mode "verify": user has 2FA → ask for a code
 *  - mode "setup":  admin without 2FA → must enrol before getting any session
 */
export async function login({ email, password }, req, { adminOnly = false } = {}) {
  const ip = req.ip ?? 'unknown';
  await lockout.assertNotLocked(ip, email);

  const user = await models.User.scope('withPassword').findOne({ where: { email } });
  const valid = user?.passwordHash ? await verifyPassword(user.passwordHash, password) : (await burnPasswordCheck(password), false);

  if (!valid) {
    await lockout.recordFailure(ip, email);
    await audit('auth.login.failure', { req, actorId: user?.id ?? null, metadata: { reason: user ? 'bad_password' : 'unknown_email' } });
    throw ApiError.unauthorized(WRONG_CREDENTIALS, 'INVALID_CREDENTIALS');
  }
  // Admin sign-in page: a valid non-admin account gets the same answer as a wrong password.
  if (adminOnly && user.role !== ROLES.ADMIN) {
    await lockout.recordFailure(ip, email);
    await audit('auth.login.failure', { req, actorId: user.id, metadata: { reason: 'not_admin' } });
    throw ApiError.unauthorized(WRONG_CREDENTIALS, 'INVALID_CREDENTIALS');
  }
  await lockout.clear(ip, email);

  if (needsRehash(user.passwordHash)) {
    await models.User.update({ passwordHash: await hashPassword(password) }, { where: { id: user.id } });
  }
  if (!user.emailVerifiedAt) {
    throw ApiError.forbidden('Please confirm your email first. We can send the link again.', 'EMAIL_NOT_VERIFIED');
  }
  if (user.status !== USER_STATUS.ACTIVE) {
    throw ApiError.forbidden('This account is suspended. Please contact support.', 'ACCOUNT_SUSPENDED');
  }

  if (await twoFactor.isEnabled(user.id)) return { mfaRequired: true, mfaTicket: await createMfaTicket(user, 'verify') };
  if (user.role === ROLES.ADMIN) return { mfaSetupRequired: true, mfaTicket: await createMfaTicket(user, 'setup') };
  return completeLogin(user, ['pwd'], req);
}

export async function verifyLoginSecondFactor({ mfaTicket, code }, req) {
  const data = await readMfaTicket(mfaTicket, 'verify');
  const user = await models.User.findByPk(data.userId);
  if (!user || user.status !== USER_STATUS.ACTIVE) throw ApiError.unauthorized('Please sign in again', 'MFA_TICKET_INVALID');
  const ok = await twoFactor.verifySecondFactor(user, code);
  if (!ok) {
    await audit('auth.2fa.failure', { req, actorId: user.id });
    await failMfaAttempt(mfaTicket, data);
  }
  await ephemeralStore.del(ticketKey(mfaTicket));
  return completeLogin(user, ['pwd', 'otp'], req);
}

/** Admin first login: enrol 2FA using the ticket (no session exists yet). */
export async function beginEnrolmentWithTicket({ mfaTicket }) {
  const data = await readMfaTicket(mfaTicket, 'setup');
  const user = await models.User.findByPk(data.userId);
  if (!user) throw ApiError.unauthorized('Please sign in again', 'MFA_TICKET_INVALID');
  return twoFactor.beginEnrolment(user);
}

export async function enableWithTicket({ mfaTicket, code }, req) {
  const data = await readMfaTicket(mfaTicket, 'setup');
  const user = await models.User.findByPk(data.userId);
  if (!user) throw ApiError.unauthorized('Please sign in again', 'MFA_TICKET_INVALID');
  const backupCodes = await twoFactor.enable(user, code);
  if (!backupCodes) await failMfaAttempt(mfaTicket, data);
  await ephemeralStore.del(ticketKey(mfaTicket));
  await invalidateUserState(user.id);
  await audit('auth.2fa.enabled', { req, actorId: user.id, entityType: 'user', entityId: user.id });
  return { ...(await completeLogin(user, ['pwd', 'otp'], req)), backupCodes };
}

// ── Sessions ─────────────────────────────────────────────────────────────────────────────────────

export async function refresh(rawRefresh, req) {
  const result = await rotateRefreshToken(rawRefresh, req);
  if (result.reused) {
    const user = await models.User.findByPk(result.userId);
    await audit('auth.refresh.reuse_detected', { req, actorId: result.userId, metadata: { familyId: result.familyId } });
    if (user) sendMail('sessionAlert', user.email, { name: user.displayName });
    throw ApiError.unauthorized('Please sign in again', 'SESSION_REVOKED');
  }
  const { user, amr, familyId } = result;
  const accessToken = await signAccessToken(user, { sid: familyId, amr });
  return {
    accessToken,
    user: publicUser(user, { twoFactorEnabled: await twoFactor.isEnabled(user.id) }),
    // The new token's own expiry (idle lifetime, capped by the session's hard end).
    refresh: { raw: result.raw, expiresAt: result.expiresAt },
  };
}

export async function logout(rawRefresh, req) {
  const family = await findActiveFamily(rawRefresh);
  if (!family) return;
  await revokeFamily(family.familyId, 'logout');
  // Access tokens of this session stop working immediately, not in up to 15 minutes.
  await ephemeralStore.set(revokedSessionKey(family.familyId), '1', 15 * 60);
  await audit('auth.logout', { req, actorId: family.userId });
}

export async function logoutEverywhere(userId, req) {
  await sequelize.transaction(async (transaction) => {
    await models.User.increment('tokenVersion', { where: { id: userId }, transaction });
    await revokeAllForUser(userId, 'logout_all', transaction);
  });
  await invalidateUserState(userId);
  await audit('auth.logout_all', { req, actorId: userId });
}

// ── Password reset ───────────────────────────────────────────────────────────────────────────────

export async function forgotPassword(email, req) {
  const user = await models.User.findOne({ where: { email } });
  if (!user || user.status !== USER_STATUS.ACTIVE) return;
  const raw = await sequelize.transaction((t) => createEmailToken(user.id, AUTH_TOKEN_PURPOSE.PASSWORD_RESET, t));
  sendMail('resetPassword', user.email, { name: user.displayName, url: appLink('/reset-password', { token: raw }) });
  await audit('auth.password.reset_requested', { req, actorId: user.id });
}

export async function resetPassword({ token, password }, req) {
  const user = await sequelize.transaction(async (transaction) => {
    const row = await consumeEmailToken(token, AUTH_TOKEN_PURPOSE.PASSWORD_RESET, transaction);
    const target = await models.User.findByPk(row.userId, { transaction });
    if (!target) throw ApiError.badRequest('This link is invalid or has expired.', undefined, 'INVALID_TOKEN');
    await assertAcceptablePassword(password, { email: target.email, displayName: target.displayName });
    await target.update(
      {
        passwordHash: await hashPassword(password),
        passwordChangedAt: new Date(),
        tokenVersion: target.tokenVersion + 1,
        // Following the emailed link proves the address belongs to them.
        emailVerifiedAt: target.emailVerifiedAt ?? new Date(),
      },
      { transaction },
    );
    await revokeAllForUser(target.id, 'password_reset', transaction);
    return target;
  });
  await invalidateUserState(user.id);
  sendMail('passwordChanged', user.email, { name: user.displayName });
  await audit('auth.password.reset', { req, actorId: user.id });
}

// ── 2FA for signed-in users (optional for users, done at first login for admins) ────────────────

export async function beginEnrolmentForUser(userId) {
  const user = await models.User.findByPk(userId);
  if (await twoFactor.isEnabled(userId)) throw ApiError.conflict('Two-factor authentication is already on', 'MFA_ALREADY_ENABLED');
  return twoFactor.beginEnrolment(user);
}

export async function enableForUser(userId, code, req) {
  const user = await models.User.findByPk(userId);
  const backupCodes = await twoFactor.enable(user, code);
  if (!backupCodes) {
    throw ApiError.badRequest('That code didn’t match. Codes change every 30 seconds, so enter the one your app shows now.', undefined, 'INVALID_CODE');
  }
  await audit('auth.2fa.enabled', { req, actorId: userId, entityType: 'user', entityId: userId });
  return { backupCodes };
}

