// CSRF protection for the only two endpoints that act on a cookie (/auth/refresh, /auth/logout).
// Everything else uses the Bearer token, which a forged cross-site request can't attach.
//
// Signed double-submit: GET /auth/csrf returns a random token in the body and sets an HttpOnly cookie
// holding "<token>.<hmac>". A cookie route must send the token back in X-CSRF-Token. Another site can't
// read our response (CORS) or forge the HMAC, so it can't produce a matching pair. Origin must also be ours.
import { env } from '../config/env.js';
import { hmacHex, randomToken, safeEqual } from '../utils/crypto.js';
import { ApiError } from '../utils/ApiError.js';
import { CSRF_COOKIE, setCsrfCookie } from '../modules/auth/cookies.js';

const sign = (token) => hmacHex(env.CSRF_SECRET, token);

export function issueCsrfToken(res) {
  const token = randomToken(24);
  setCsrfCookie(res, `${token}.${sign(token)}`);
  return token;
}

const allowedOrigins = new Set(env.CLIENT_ORIGIN);

export function requireCsrf(req, _res, next) {
  const origin = req.get('origin');
  if (!origin || !allowedOrigins.has(origin)) {
    return next(ApiError.forbidden('Request origin not allowed', 'CSRF_FAILED'));
  }
  const header = req.get('x-csrf-token');
  const [token, signature] = String(req.cookies?.[CSRF_COOKIE] ?? '').split('.');
  const valid = header && token && signature && safeEqual(header, token) && safeEqual(signature, sign(token));
  if (!valid) return next(ApiError.forbidden('Security check failed. Please refresh the page.', 'CSRF_FAILED'));
  return next();
}
