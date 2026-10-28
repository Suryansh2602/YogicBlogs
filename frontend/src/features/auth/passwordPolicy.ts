// Mirrors the server's password policy (backend/src/modules/auth/password.service.js) for instant
// feedback. The server stays the authority and also checks known-breached passwords.

export const PASSWORD_MIN = 12;
export const PASSWORD_MAX = 128;

/** Each message says exactly what is wrong, without ever repeating the password itself. */
export function passwordProblems(password: string, { email, displayName }: { email?: string; displayName?: string } = {}): string[] {
  if (!password) return ['Enter a password.'];
  const problems: string[] = [];
  const lower = password.toLowerCase();
  const emailName = email?.split('@')[0]?.toLowerCase() ?? '';
  const name = displayName?.trim().toLowerCase() ?? '';
  if (password.length < PASSWORD_MIN) {
    problems.push(`Your password has ${password.length} character${password.length === 1 ? '' : 's'}. Use at least ${PASSWORD_MIN}.`);
  }
  if (password.length > PASSWORD_MAX) problems.push(`Your password has ${password.length} characters. The limit is ${PASSWORD_MAX}.`);
  if (emailName.length >= 4 && lower.includes(emailName)) problems.push(`Your password contains “${emailName}” from your email address. Remove it.`);
  if (name.length >= 4 && lower.includes(name)) problems.push('Your password contains your name. Remove it.');
  if (password.length > 1 && /^(.)\1+$/.test(password)) problems.push('Your password is one character repeated. Mix in other characters.');
  return problems;
}

/**
 * Rough strength 0–4 for the meter: length matters most (passphrases are encouraged), variety helps.
 * Deliberately simple (no 400 kB dictionary library); it guides, it doesn't decide.
 */
export function passwordStrength(password: string): 0 | 1 | 2 | 3 | 4 {
  if (password.length < PASSWORD_MIN || /^(.)\1+$/.test(password)) return password.length ? 1 : 0;
  const variety = [/[a-z]/, /[A-Z]/, /\d/, /[^A-Za-z0-9]/].filter((re) => re.test(password)).length;
  const unique = new Set(password).size;
  let score = 2;
  if (password.length >= 16 || variety >= 3) score += 1;
  if (password.length >= 20 && variety >= 2 && unique >= 10) score += 1;
  if (unique < 6) score = 2;
  return Math.min(score, 4) as 2 | 3 | 4;
}
