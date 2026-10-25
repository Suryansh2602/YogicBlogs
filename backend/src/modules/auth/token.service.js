import { SignJWT, jwtVerify } from 'jose';
import { Op } from 'sequelize';
import { v7 as uuidv7 } from 'uuid';
import { env } from '../../config/env.js';
import { models, sequelize } from '../../config/db.js';
import { ROLES } from '../../config/constants.js';
import { durationToMs } from '../../utils/duration.js';
import { hmacHex, randomToken } from '../../utils/crypto.js';
import { ApiError } from '../../utils/ApiError.js';

export const JWT_ISSUER = 'healthmarg-api';
export const JWT_AUDIENCE = 'healthmarg-web';
const accessKey = new TextEncoder().encode(env.JWT_ACCESS_SECRET);

// Two browser tabs refreshing at the same moment: the loser presents a token rotated a moment ago.
// Within this window that's a race (409, nothing revoked), not theft.
export const REFRESH_RACE_WINDOW_MS = 10_000;

export function sessionLifetimes(role) {
  const staff = role === ROLES.ADMIN;
  return {
    idleMs: durationToMs(staff ? env.ADMIN_REFRESH_EXPIRES_IN : env.JWT_REFRESH_EXPIRES_IN),
    maxMs: durationToMs(staff ? env.ADMIN_SESSION_MAX_AGE : env.SESSION_MAX_AGE),
  };
}

/** Short-lived access token. `tv` (token_version) lets us revoke every token of a user instantly. */
export function signAccessToken(user, { sid, amr }) {
  return new SignJWT({ role: user.role, tv: user.tokenVersion, sid, amr })
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setSubject(user.id)
    .setIssuer(JWT_ISSUER)
    .setAudience(JWT_AUDIENCE)
    .setIssuedAt()
    .setExpirationTime(env.JWT_ACCESS_EXPIRES_IN)
    .sign(accessKey);
}

/** Throws 401 for anything but a valid, unexpired HS256 token from us (alg pinned: no "none", no HS512 swap). */
export async function verifyAccessToken(token) {
  try {
    const { payload } = await jwtVerify(token, accessKey, {
      algorithms: ['HS256'],
      issuer: JWT_ISSUER,
      audience: JWT_AUDIENCE,
      clockTolerance: 5,
    });
    return payload;
  } catch {
    throw ApiError.unauthorized('Your session has expired. Please sign in again.', 'TOKEN_INVALID');
  }
}

const hashRefresh = (raw) => hmacHex(env.JWT_REFRESH_SECRET, raw);

/** Start a new session (token family) or continue one; returns the raw token for the cookie. */
export async function issueRefreshToken(user, { familyId = uuidv7(), familyExpiresAt, amr, req, transaction } = {}) {
  const { idleMs, maxMs } = sessionLifetimes(user.role);
  const now = Date.now();
  const hardEnd = familyExpiresAt ?? new Date(now + maxMs);
  const raw = randomToken(32);
  const row = await models.RefreshToken.create(
    {
      userId: user.id,
      familyId,
      tokenHash: hashRefresh(raw),
      expiresAt: new Date(Math.min(now + idleMs, hardEnd.getTime())),
      familyExpiresAt: hardEnd,
      amr: amr.join('+'),
      ip: req?.ip ?? null,
      userAgent: req?.get?.('user-agent')?.slice(0, 512) ?? null,
    },
    { transaction },
  );
  return { raw, row };
}

export async function revokeFamily(familyId, reason, transaction) {
  await models.RefreshToken.update(
    { revokedAt: new Date(), revokedReason: reason },
    { where: { familyId, revokedAt: null }, transaction },
  );
}

export async function revokeAllForUser(userId, reason, transaction) {
  await models.RefreshToken.update(
    { revokedAt: new Date(), revokedReason: reason },
    { where: { userId, revokedAt: null }, transaction },
  );
}

/**
 * Rotate a refresh token: the presented token is revoked and replaced by a new one in the same family.
 * Presenting an already-rotated token (outside the race window) means it was stolen: the whole
 * family (session) is revoked and `reused: true` is reported so the caller can alert the user.
 */
export async function rotateRefreshToken(raw, req) {
  if (!raw) throw ApiError.unauthorized('Please sign in', 'NO_SESSION');
  return sequelize.transaction(async (transaction) => {
    const current = await models.RefreshToken.findOne({
      where: { tokenHash: hashRefresh(raw) },
      lock: transaction.LOCK.UPDATE,
      transaction,
    });
    if (!current) throw ApiError.unauthorized('Please sign in', 'NO_SESSION');

    if (current.revokedAt) {
      const rotatedRecently =
        current.revokedReason === 'rotated' && Date.now() - current.revokedAt.getTime() < REFRESH_RACE_WINDOW_MS;
      if (rotatedRecently) throw ApiError.conflict('Session refresh already in progress', 'REFRESH_RACE');
      if (current.revokedReason === 'rotated') {
        await revokeFamily(current.familyId, 'reuse_detected', transaction);
        return { reused: true, userId: current.userId, familyId: current.familyId };
      }
      throw ApiError.unauthorized('Please sign in', 'NO_SESSION');
    }

    const now = new Date();
    if (current.expiresAt <= now || current.familyExpiresAt <= now) {
      throw ApiError.unauthorized('Your session has expired. Please sign in again.', 'SESSION_EXPIRED');
    }

    const user = await models.User.findByPk(current.userId, { transaction });
    if (!user || user.status !== 'active') {
      await revokeFamily(current.familyId, 'user_inactive', transaction);
      throw ApiError.unauthorized('Please sign in', 'NO_SESSION');
    }

    const { raw: nextRaw, row: next } = await issueRefreshToken(user, {
      familyId: current.familyId,
      familyExpiresAt: current.familyExpiresAt,
      amr: current.amr ? current.amr.split('+') : ['pwd'],
      req,
      transaction,
    });
    await current.update({ revokedAt: now, revokedReason: 'rotated', replacedById: next.id }, { transaction });
    return { reused: false, user, raw: nextRaw, expiresAt: next.expiresAt, familyId: current.familyId, amr: next.amr.split('+') };
  });
}

/** Look up the session (family) behind a raw refresh token, if still active. */
export async function findActiveFamily(raw) {
  if (!raw) return null;
  const row = await models.RefreshToken.findOne({
    where: { tokenHash: hashRefresh(raw), revokedAt: null, expiresAt: { [Op.gt]: new Date() } },
  });
  return row ? { familyId: row.familyId, userId: row.userId } : null;
}
