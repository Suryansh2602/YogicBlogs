import { models } from '../config/db.js';
import { USER_STATUS } from '../config/constants.js';
import { ephemeralStore } from '../utils/ephemeralStore.js';
import { ApiError } from '../utils/ApiError.js';
import { verifyAccessToken } from '../modules/auth/token.service.js';

const STATE_TTL_SECONDS = 15 * 60; // = max access-token lifetime
const stateKey = (userId) => `auth:tv:${userId}`;
export const revokedSessionKey = (familyId) => `auth:sid-revoked:${familyId}`;

/** Cached {tokenVersion, role, status} so most requests skip a DB read. Invalidate on any change. */
async function loadUserState(userId) {
  const cached = await ephemeralStore.get(stateKey(userId));
  if (cached) return JSON.parse(cached);
  const user = await models.User.findByPk(userId, { attributes: ['id', 'tokenVersion', 'role', 'status'] });
  if (!user) return null;
  const state = { tokenVersion: user.tokenVersion, role: user.role, status: user.status };
  await ephemeralStore.set(stateKey(userId), JSON.stringify(state), STATE_TTL_SECONDS);
  return state;
}

export const invalidateUserState = (userId) => ephemeralStore.del(stateKey(userId));

/**
 * Requires "Authorization: Bearer <access token>". Rejects tokens that are invalid, expired, issued before
 * a token_version bump (logout everywhere, password/role change, suspension) or from a signed-out session.
 * Sets req.auth = { userId, role, sid, amr }.
 */
export async function authenticate(req, _res, next) {
  try {
    const header = req.get('authorization') ?? '';
    const [scheme, token] = header.split(' ');
    if (scheme !== 'Bearer' || !token) throw ApiError.unauthorized('Please sign in', 'NO_TOKEN');

    const payload = await verifyAccessToken(token);
    const state = await loadUserState(payload.sub);
    if (!state || state.tokenVersion !== payload.tv || state.status !== USER_STATUS.ACTIVE) {
      throw ApiError.unauthorized('Your session has ended. Please sign in again.', 'TOKEN_REVOKED');
    }
    if (payload.sid && (await ephemeralStore.get(revokedSessionKey(payload.sid)))) {
      throw ApiError.unauthorized('Your session has ended. Please sign in again.', 'TOKEN_REVOKED');
    }

    req.auth = { userId: payload.sub, role: state.role, sid: payload.sid, amr: payload.amr ?? [] };
    return next();
  } catch (err) {
    return next(err);
  }
}

/**
 * For pages anyone may open but signed-in people see more of (members articles). No Authorization header:
 * an anonymous visitor (req.auth stays undefined). A header that fails is still a 401, so the site
 * refreshes its token and asks again instead of quietly showing the anonymous version.
 */
export function optionalAuthenticate(req, res, next) {
  if (!req.get('authorization')) return next();
  return authenticate(req, res, next);
}

/** Role check. Use after `authenticate`. */
export const requireRole =
  (...roles) =>
  (req, _res, next) =>
    roles.includes(req.auth?.role) ? next() : next(ApiError.forbidden('You don’t have access to this', 'FORBIDDEN'));

/** The session must have passed a second factor (TOTP or backup code). Mandatory for admins. */
export const requireMfa = (req, _res, next) =>
  req.auth?.amr?.includes('otp') ? next() : next(ApiError.forbidden('Two-factor authentication required', 'MFA_REQUIRED'));
