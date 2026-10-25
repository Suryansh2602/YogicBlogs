import { env } from '../../config/env.js';

// Cookies are only ever sent to the auth endpoints that need them (Path), never readable by JavaScript
// (HttpOnly), never sent cross-site (SameSite=Strict), HTTPS-only in production (Secure + __Secure- prefix).
const prefix = env.isProduction ? '__Secure-' : '';
export const REFRESH_COOKIE = `${prefix}hm_rt`;
export const CSRF_COOKIE = `${prefix}hm_csrf`;
export const AUTH_COOKIE_PATH = '/api/v1/auth';

const base = () => ({
  httpOnly: true,
  secure: env.isProduction,
  sameSite: 'strict',
  path: AUTH_COOKIE_PATH,
});

export function setRefreshCookie(res, raw, expiresAt) {
  res.cookie(REFRESH_COOKIE, raw, { ...base(), expires: expiresAt });
}

export function clearRefreshCookie(res) {
  res.clearCookie(REFRESH_COOKIE, base());
}

export function setCsrfCookie(res, value) {
  res.cookie(CSRF_COOKIE, value, base());
}
