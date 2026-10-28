import { Router } from 'express';
import { env } from '../../config/env.js';
import { validate } from '../../middlewares/validate.js';
import { requireCsrf } from '../../middlewares/csrf.js';
import { requireRecaptcha } from '../../middlewares/recaptcha.js';
import { authenticate } from '../../middlewares/authenticate.js';
import * as c from './auth.controller.js';
import {
  emailOnlySchema,
  loginSchema,
  mfaEnableWithTicketSchema,
  mfaTicketSchema,
  mfaVerifySchema,
  registerSchema,
  resetPasswordSchema,
  tokenSchema,
  totpEnableSchema,
} from './auth.validation.js';

/**
 * Order: strict brute-force limit on every endpoint that checks a credential, code or emailed token →
 * reCAPTCHA where a bot could abuse it → input validation → handler. /csrf, /refresh and /logout run on
 * every page load, so they get only the general API limit; the cookie routes also require CSRF + Origin.
 * @param {import('express').RequestHandler} strict
 */
export function createAuthRouter(strict) {
  const router = Router();

  router.get('/csrf', c.csrf);

  router.post('/register', strict, requireRecaptcha('register'), validate({ body: registerSchema }), c.register);
  router.post('/verify-email', strict, validate({ body: tokenSchema }), c.verifyEmail);
  router.post('/verify-email/resend', strict, requireRecaptcha('resend_verification'), validate({ body: emailOnlySchema }), c.resendVerification);

  // Login fails open on reCAPTCHA outages (lockout still protects it); a lower score is tolerated.
  const loginCaptcha = requireRecaptcha('login', { minScore: env.RECAPTCHA_LOGIN_MIN_SCORE, failOpen: true });
  router.post('/login', strict, loginCaptcha, validate({ body: loginSchema }), c.login());
  router.post('/admin/login', strict, requireRecaptcha('admin_login', { minScore: env.RECAPTCHA_MIN_SCORE }), validate({ body: loginSchema }), c.login({ adminOnly: true }));
  router.post('/login/2fa', strict, validate({ body: mfaVerifySchema }), c.verifyLoginSecondFactor);
  router.post('/login/2fa/setup', strict, validate({ body: mfaTicketSchema }), c.beginEnrolmentWithTicket);
  router.post('/login/2fa/enable', strict, validate({ body: mfaEnableWithTicketSchema }), c.enableWithTicket);

  router.post('/refresh', requireCsrf, c.refresh);
  router.post('/logout', requireCsrf, c.logout);
  router.post('/logout-all', authenticate, c.logoutEverywhere);

  router.post('/password/forgot', strict, requireRecaptcha('forgot_password'), validate({ body: emailOnlySchema }), c.forgotPassword);
  router.post('/password/reset', strict, validate({ body: resetPasswordSchema }), c.resetPassword);

  router.post('/2fa/setup', authenticate, c.beginEnrolment);
  router.post('/2fa/enable', strict, authenticate, validate({ body: totpEnableSchema }), c.enable);

  return router;
}
