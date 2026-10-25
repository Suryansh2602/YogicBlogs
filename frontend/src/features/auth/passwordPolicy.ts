// Mirrors the server's password policy (backend/src/modules/auth/password.service.js) for instant
// feedback. The server stays the authority and also checks known-breached passwords.

export const PASSWORD_MIN = 12;
export const PASSWORD_MAX = 128;

export function passwordProblems(password: string, { email, displayName }: { email?: string; displayName?: string } = {}): string[] {
  const problems: string[] = [];
  const lower = password.toLowerCase();
  const local = email?.split('@')[0]?.toLowerCase() ?? '';
  if (password.length < PASSWORD_MIN) problems.push(`Use at least ${PASSWORD_MIN} characters`);
  if (password.length > PASSWORD_MAX) problems.push(`Use at most ${PASSWORD_MAX} characters`);
  if (local.length >= 4 && lower.includes(local)) problems.push('Don’t include your email in your password');
  if (displayName && displayName.trim().length >= 4 && lower.includes(displayName.trim().toLowerCase())) {
    problems.push('Don’t include your name in your password');
  }
  if (/^(.)\1+$/.test(password)) problems.push('Don’t repeat a single character');
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
