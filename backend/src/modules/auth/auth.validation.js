import { z } from 'zod';

/** Says what is wrong with an email address (the frontend mirrors this in features/auth/validation.ts). */
export function emailProblem(raw) {
  const value = String(raw ?? '').trim();
  if (!value) return 'Enter your email address.';
  if (/\s/.test(value)) return 'Your email address contains a space. Remove it.';
  const at = value.split('@').length - 1;
  if (at === 0) return 'Your email address is missing the “@”, like name@gmail.com.';
  if (at > 1) return 'Your email address has more than one “@”. Use only one.';
  const [local, domain] = value.split('@');
  if (!local) return 'Add your name before the “@”, like name@gmail.com.';
  if (!domain) return 'Add the domain after the “@”, like name@gmail.com.';
  if (!domain.includes('.') || domain.endsWith('.') || domain.startsWith('.')) {
    return `“${domain}” isn’t a complete domain. It needs an ending like .com or .in.`;
  }
  return 'This doesn’t look like a valid email address. Check it for typos.';
}

// .strict(): unknown fields are rejected, so e.g. {"role":"admin"} can't be smuggled into sign-up.
export const email = z
  .string()
  .trim()
  .toLowerCase()
  .max(254, 'Your email address is longer than 254 characters, which no real address is.')
  .pipe(z.email({ error: (issue) => emailProblem(issue.input) }));
export const password = z
  .string()
  .min(12, { error: (issue) => `Your password has ${String(issue.input).length} characters. Use at least 12.` })
  .max(128, { error: (issue) => `Your password has ${String(issue.input).length} characters. The limit is 128.` });
export const displayName = z.string().trim().min(1, 'Enter your name').max(80, 'Use at most 80 characters');
const captchaToken = z.string().max(4000).optional();
const urlToken = z.string().min(20).max(200).regex(/^[A-Za-z0-9_-]+$/, 'Invalid link');
const mfaTicket = z.string().min(20).max(200).regex(/^[A-Za-z0-9_-]+$/);
const totpCode = z.string().trim().regex(/^\d{6}$/, 'Enter the 6-digit code');
// 6-digit authenticator code or a backup code like ABCDE-12345.
const secondFactorCode = z
  .string()
  .trim()
  .max(20)
  .regex(/^(\d{6}|[A-Za-z0-9]{5}-?[A-Za-z0-9]{5})$/, 'Enter the 6-digit code or a backup code');

export const registerSchema = z
  .object({
    email,
    password,
    displayName,
    acceptTerms: z.literal(true, 'You must accept the Terms'),
    acceptPrivacy: z.literal(true, 'You must accept the Privacy Policy'),
    captchaToken,
  })
  .strict();

export const loginSchema = z.object({ email, password: z.string().min(1).max(128), captchaToken }).strict();
export const tokenSchema = z.object({ token: urlToken }).strict();
export const emailOnlySchema = z.object({ email, captchaToken }).strict();
export const resetPasswordSchema = z.object({ token: urlToken, password }).strict();
export const mfaVerifySchema = z.object({ mfaTicket, code: secondFactorCode }).strict();
export const mfaTicketSchema = z.object({ mfaTicket }).strict();
export const mfaEnableWithTicketSchema = z.object({ mfaTicket, code: totpCode }).strict();
export const totpEnableSchema = z.object({ code: totpCode }).strict();
