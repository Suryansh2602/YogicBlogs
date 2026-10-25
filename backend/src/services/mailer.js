import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import nodemailer from 'nodemailer';
import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';

export const OUTBOX_DIR = join(process.cwd(), '.local', 'outbox');

const escapeHtml = (value) =>
  String(value).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

/** Links in emails are always built from APP_URL, never from the request (host-header injection). */
export const appLink = (path, params = {}) => {
  const url = new URL(path, env.APP_URL);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  return url.toString();
};

function layout({ heading, intro, actionLabel, actionUrl, outro }) {
  return `<!doctype html><html><body style="margin:0;background:#FBF6EF;font-family:Arial,Helvetica,sans-serif;color:#1F2B5E">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:32px 16px">
    <table role="presentation" width="100%" style="max-width:520px;background:#ffffff;border-radius:12px;padding:32px">
      <tr><td style="font-size:22px;font-weight:bold">Health<span style="color:#12807F">marg</span></td></tr>
      <tr><td style="padding-top:20px;font-size:18px;font-weight:bold">${escapeHtml(heading)}</td></tr>
      <tr><td style="padding-top:12px;font-size:15px;line-height:1.6">${escapeHtml(intro)}</td></tr>
      ${
        actionUrl
          ? `<tr><td style="padding:24px 0"><a href="${escapeHtml(actionUrl)}" style="background:#12807F;color:#ffffff;text-decoration:none;padding:12px 22px;border-radius:8px;font-weight:bold;display:inline-block">${escapeHtml(actionLabel)}</a></td></tr>
      <tr><td style="font-size:12px;color:#5A6378;word-break:break-all">Or paste this link into your browser: ${escapeHtml(actionUrl)}</td></tr>`
          : ''
      }
      <tr><td style="padding-top:20px;font-size:13px;color:#5A6378;line-height:1.6">${escapeHtml(outro)}</td></tr>
    </table>
    <p style="font-size:12px;color:#5A6378">BREAK LIMITS. FIND EASE.</p>
  </td></tr></table></body></html>`;
}

const templates = {
  verifyEmail: ({ name, url }) => ({
    subject: 'Confirm your email for Healthmarg',
    html: layout({
      heading: `Welcome, ${name}`,
      intro: 'Please confirm your email address to finish creating your Healthmarg account.',
      actionLabel: 'Confirm email',
      actionUrl: url,
      outro: 'This link expires in 24 hours. If you did not sign up, you can ignore this email.',
    }),
  }),
  alreadyRegistered: ({ name, url }) => ({
    subject: 'Someone tried to sign up with your email',
    html: layout({
      heading: `Hi ${name}`,
      intro: 'Someone (maybe you) tried to create a new Healthmarg account with this email. You already have an account.',
      actionLabel: 'Sign in',
      actionUrl: url,
      outro: 'If this was not you, no action is needed. Your account is safe.',
    }),
  }),
  resetPassword: ({ name, url }) => ({
    subject: 'Reset your Healthmarg password',
    html: layout({
      heading: `Hi ${name}`,
      intro: 'We received a request to reset your password.',
      actionLabel: 'Choose a new password',
      actionUrl: url,
      outro: 'This link expires in 1 hour and works once. If you did not ask for this, ignore this email.',
    }),
  }),
  passwordChanged: ({ name }) => ({
    subject: 'Your Healthmarg password was changed',
    html: layout({
      heading: `Hi ${name}`,
      intro: 'Your password was just changed and all other sessions were signed out.',
      outro: 'If this was not you, reset your password immediately and contact support.',
    }),
  }),
  sessionAlert: ({ name }) => ({
    subject: 'Security alert: your session was signed out',
    html: layout({
      heading: `Hi ${name}`,
      intro: 'We detected an old sign-in token being reused, which can mean it was stolen. We signed that session out to protect you.',
      outro: 'If you did not expect this, change your password.',
    }),
  }),
};

let transport;
const getTransport = () =>
  (transport ??= nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: env.SMTP_SECURE,
    ...(env.SMTP_USER && { auth: { user: env.SMTP_USER, pass: env.SMTP_PASSWORD } }),
  }));

/**
 * Send a templated email. In outbox mode it's written to backend/.local/outbox/*.html (open it in a browser).
 * Failures are logged, never thrown: a mail outage must not break sign-up or reveal anything to the caller.
 */
export async function sendMail(template, to, data) {
  if (!env.EMAIL_ENABLED) return; // email features are switched off (EMAIL_ENABLED=false)
  const { subject, html } = templates[template](data);
  try {
    if (env.MAIL_MODE === 'smtp') {
      await getTransport().sendMail({ from: env.MAIL_FROM, to, subject, html });
      return;
    }
    await mkdir(OUTBOX_DIR, { recursive: true });
    const safeTo = to.replace(/[^a-z0-9@._-]/gi, '_');
    const file = join(OUTBOX_DIR, `${new Date().toISOString().replace(/[:.]/g, '-')}-${template}-${safeTo}.html`);
    // Safe: fixed directory, file name sanitised to [a-z0-9@._-] above; development outbox only.
    // eslint-disable-next-line security/detect-non-literal-fs-filename
    await writeFile(file, html, 'utf8');
    logger.info({ template, file, ...(data.url && { link: data.url }) }, 'Email saved to outbox (development)');
  } catch (err) {
    logger.error({ err, template }, 'Failed to send email');
  }
}
