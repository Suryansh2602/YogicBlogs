// Google reCAPTCHA v3 (score-based, invisible). The frontend sends `captchaToken` for the action.
// Checks: success, same action, our hostname, fresh (≤ 2 min), score ≥ threshold.
// RECAPTCHA_MODE=off skips it (development only: production refuses to start without "live").
import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';
import { ApiError } from '../utils/ApiError.js';

const VERIFY_URL = 'https://www.google.com/recaptcha/api/siteverify';
const MAX_AGE_MS = 2 * 60 * 1000;
const expectedHost = new URL(env.APP_URL).hostname;

/**
 * @param {string} action   e.g. 'register', 'login', 'forgot_password'
 * @param {object} options
 * @param {number} options.minScore
 * @param {boolean} options.failOpen  if Google can't be reached: let the request through (login, which is
 *   also protected by lockout) or refuse it (sign-up, password reset).
 * `mode`, `secret` and `fetchImpl` default to the environment; tests override them.
 */
export function requireRecaptcha(
  action,
  { minScore = env.RECAPTCHA_MIN_SCORE, failOpen = false, fetchImpl = fetch, mode = env.RECAPTCHA_MODE, secret = env.RECAPTCHA_SECRET } = {},
) {
  return async (req, _res, next) => {
    if (mode === 'off') return next();

    const token = req.body?.captchaToken;
    if (typeof token !== 'string' || token.length < 10 || token.length > 4000) {
      return next(ApiError.badRequest('Security check failed. Please try again.', undefined, 'CAPTCHA_FAILED'));
    }

    let result;
    try {
      const res = await fetchImpl(VERIFY_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ secret, response: token, remoteip: req.ip ?? '' }),
        signal: AbortSignal.timeout(3_000),
      });
      result = await res.json();
    } catch (err) {
      logger.warn({ err: err.message, action }, 'reCAPTCHA verification unavailable');
      return failOpen ? next() : next(ApiError.unavailable('Security check unavailable. Please try again shortly.'));
    }

    const fresh = result.challenge_ts && Date.now() - new Date(result.challenge_ts).getTime() <= MAX_AGE_MS;
    const ok =
      result.success === true &&
      result.action === action &&
      result.hostname === expectedHost &&
      fresh &&
      typeof result.score === 'number' &&
      result.score >= minScore;

    if (!ok) {
      logger.info({ action, score: result.score, success: result.success }, 'reCAPTCHA rejected request');
      return next(ApiError.badRequest('Security check failed. Please try again.', undefined, 'CAPTCHA_FAILED'));
    }
    req.recaptchaScore = result.score;
    return next();
  };
}
