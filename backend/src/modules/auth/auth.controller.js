// HTTP layer for auth: read validated input, call the service, shape the response, manage cookies.
// No business rules here — they live in auth.service.js.
import * as auth from './auth.service.js';
import { issueCsrfToken } from '../../middlewares/csrf.js';
import { REFRESH_COOKIE, clearRefreshCookie, setRefreshCookie } from './cookies.js';

const ACCEPTED = { message: 'If the details are valid, we’ve sent you an email with the next step.' };

/** Finished login → refresh token goes into the HttpOnly cookie, never into the JSON body. */
function sendSession(res, { accessToken, user, refresh, backupCodes }) {
  setRefreshCookie(res, refresh.raw, refresh.expiresAt);
  res.set('Cache-Control', 'no-store');
  res.json({ accessToken, user, ...(backupCodes && { backupCodes }) });
}

export function csrf(_req, res) {
  res.set('Cache-Control', 'no-store');
  res.json({ csrfToken: issueCsrfToken(res) });
}

export async function register(req, res) {
  await auth.register(req.body, req);
  res.status(202).json(ACCEPTED);
}

export async function verifyEmail(req, res) {
  await auth.verifyEmail(req.body.token, req);
  res.json({ message: 'Your email is confirmed. You can sign in now.' });
}

export async function resendVerification(req, res) {
  await auth.resendVerification(req.body.email, req);
  res.status(202).json(ACCEPTED);
}

/** Shared by the user (/auth/login) and admin (/auth/admin/login) sign-in pages. */
export const login =
  ({ adminOnly = false } = {}) =>
  async (req, res) => {
    const result = await auth.login(req.body, req, { adminOnly });
    if (result.mfaTicket) {
      res.set('Cache-Control', 'no-store');
      return res.json(result); // { mfaRequired | mfaSetupRequired, mfaTicket }
    }
    return sendSession(res, result);
  };

export async function verifyLoginSecondFactor(req, res) {
  sendSession(res, await auth.verifyLoginSecondFactor(req.body, req));
}

export async function beginEnrolmentWithTicket(req, res) {
  res.set('Cache-Control', 'no-store');
  res.json(await auth.beginEnrolmentWithTicket(req.body));
}

export async function enableWithTicket(req, res) {
  sendSession(res, await auth.enableWithTicket(req.body, req));
}

export async function refresh(req, res) {
  try {
    sendSession(res, await auth.refresh(req.cookies?.[REFRESH_COOKIE], req));
  } catch (err) {
    // A dead session must also lose its cookie (but a two-tab race keeps it).
    if (err.code !== 'REFRESH_RACE') clearRefreshCookie(res);
    throw err;
  }
}

export async function logout(req, res) {
  await auth.logout(req.cookies?.[REFRESH_COOKIE], req);
  clearRefreshCookie(res);
  res.status(204).end();
}

export async function logoutEverywhere(req, res) {
  await auth.logoutEverywhere(req.auth.userId, req);
  clearRefreshCookie(res);
  res.status(204).end();
}

export async function forgotPassword(req, res) {
  await auth.forgotPassword(req.body.email, req);
  res.status(202).json(ACCEPTED);
}

export async function resetPassword(req, res) {
  await auth.resetPassword(req.body, req);
  clearRefreshCookie(res);
  res.json({ message: 'Your password was changed. Please sign in with the new password.' });
}

export async function beginEnrolment(req, res) {
  res.set('Cache-Control', 'no-store');
  res.json(await auth.beginEnrolmentForUser(req.auth.userId));
}

export async function enable(req, res) {
  res.set('Cache-Control', 'no-store');
  res.json(await auth.enableForUser(req.auth.userId, req.body.code, req));
}
