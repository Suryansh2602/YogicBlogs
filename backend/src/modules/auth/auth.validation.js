import { z } from 'zod';

// .strict(): unknown fields are rejected, so e.g. {"role":"admin"} can't be smuggled into sign-up.
export const email = z
  .string()
  .trim()
  .toLowerCase()
  .max(254)
  .pipe(z.email('Enter a valid email address'));
export const password = z.string().min(12, 'Use at least 12 characters').max(128, 'Use at most 128 characters');
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
