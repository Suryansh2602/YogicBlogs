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

// Reuse interval: a token rotated less than this long ago may be exchanged again (a reload or a second tab
// raced the refresh, or its reply was lost). Older reuse is treated as theft. See rotateRefreshToken.
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
 *
 * Reuse interval: a token rotated less than REFRESH_RACE_WINDOW_MS ago is exchanged once more for a
 * fresh sibling token. The reply carrying its replacement may never have reached the browser (a reload or
 * navigation mid-refresh, a closed tab, two tabs at once). Failing there would sign the person out, and
 * later look like theft. This applies only while the session is still alive: after sign-out, a password
 * reset or detected theft, there's no live token in the family and the old one gets nothing.
 *
 * Presenting a rotated token after the window means it was stolen: the whole family (session) is revoked
 * and `reused: true` is reported so the caller can alert the user.
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

    let graceReuse = false;
    if (current.revokedAt) {
      const rotatedRecently =
        current.revokedReason === 'rotated' && Date.now() - current.revokedAt.getTime() < REFRESH_RACE_WINDOW_MS;
      if (rotatedRecently) {
        const sessionAlive = await models.RefreshToken.count({ where: { familyId: current.familyId, revokedAt: null }, transaction });
        if (!sessionAlive) throw ApiError.unauthorized('Please sign in', 'NO_SESSION');
        graceReuse = true;
      } else if (current.revokedReason === 'rotated') {
        await revokeFamily(current.familyId, 'reuse_detected', transaction);
        return { reused: true, userId: current.userId, familyId: current.familyId };
      } else {
        throw ApiError.unauthorized('Please sign in', 'NO_SESSION');
      }
    }

    const now = new Date();
    if (current.familyExpiresAt <= now || (!graceReuse && current.expiresAt <= now)) {
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
    // A grace reuse leaves the earlier rotation record as it is; the new token is a sibling.
    if (!graceReuse) await current.update({ revokedAt: now, revokedReason: 'rotated', replacedById: next.id }, { transaction });
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
