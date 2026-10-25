// Field checks for instant feedback. Each message says exactly what is wrong, in the same words as the
// server (backend/src/modules/auth/auth.validation.js and password.service.js), which stays the authority.

export function emailProblem(raw: string): string | undefined {
  const value = raw.trim();
  if (!value) return 'Enter your email address.';
  if (/\s/.test(value)) return 'Your email address contains a space. Remove it.';
  const parts = value.split('@');
  if (parts.length === 1) return 'Your email address is missing the “@”, like name@gmail.com.';
  if (parts.length > 2) return 'Your email address has more than one “@”. Use only one.';
  const [local = '', domain = ''] = parts;
  if (!local) return 'Add your name before the “@”, like name@gmail.com.';
  if (!domain) return 'Add the domain after the “@”, like name@gmail.com.';
  if (!domain.includes('.') || domain.endsWith('.') || domain.startsWith('.')) {
    return `“${domain}” isn’t a complete domain. It needs an ending like .com or .in.`;
  }
  return undefined;
}

export function nameProblem(raw: string): string | undefined {
  return raw.trim() ? undefined : 'Enter your name, so we know what to call you.';
}
