import argon2 from 'argon2';
import { env } from '../../config/env.js';
import { logger } from '../../utils/logger.js';
import { sha256Hex } from '../../utils/crypto.js';

// OWASP Password Storage Cheat Sheet: argon2id, m=19 MiB, t=2, p=1.
const ARGON2_OPTIONS = { type: argon2.argon2id, memoryCost: 19_456, timeCost: 2, parallelism: 1 };

export const hashPassword = (password) => argon2.hash(password, ARGON2_OPTIONS);

export async function verifyPassword(hash, password) {
  try {
    return await argon2.verify(hash, password);
  } catch {
    return false; // malformed hash: treat as a wrong password, never as a server error
  }
}

export const needsRehash = (hash) => argon2.needsRehash(hash, ARGON2_OPTIONS);

// Verifying against a dummy hash when the account doesn't exist makes "unknown email" take as long as
// "wrong password", so response timing can't be used to discover which emails are registered.
let dummyHash;
export async function burnPasswordCheck(password) {
  dummyHash ??= await hashPassword('dummy-password-for-timing-equalisation');
  await verifyPassword(dummyHash, password);
}

/**
 * Have I Been Pwned (k-anonymity): only the first 5 characters of the SHA-1 hash leave the server.
 * Fails open (returns false) on timeout or network error so an outage never blocks sign-up.
 */
export async function isBreachedPassword(password, { fetchImpl = fetch, timeoutMs = 2_000, enabled = env.HIBP_ENABLED } = {}) {
  if (!enabled) return false;
  const { createHash } = await import('node:crypto');
  const sha1 = createHash('sha1').update(password).digest('hex').toUpperCase();
  const prefix = sha1.slice(0, 5);
  const suffix = sha1.slice(5);
  try {
    const res = await fetchImpl(`https://api.pwnedpasswords.com/range/${prefix}`, {
      headers: { 'Add-Padding': 'true' },
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) return false;
    const body = await res.text();
    return body.split('\n').some((line) => {
      const [hashSuffix, count] = line.trim().split(':');
      return hashSuffix === suffix && Number(count) > 0;
    });
  } catch (err) {
    logger.warn({ err: err.message, check: sha256Hex(prefix).slice(0, 8) }, 'Breached-password check unavailable');
    return false;
  }
}

/** Server-side policy (the frontend mirrors it for instant feedback, but this is the one that counts). */
export function passwordProblems(password, { email, displayName } = {}) {
  const problems = [];
  const lower = password.toLowerCase();
  if (password.length < 12) problems.push('Use at least 12 characters');
  if (password.length > 128) problems.push('Use at most 128 characters');
  if (email && lower.includes(email.split('@')[0].toLowerCase()) && email.split('@')[0].length >= 4) {
    problems.push('Don’t include your email in your password');
  }
  if (displayName && displayName.length >= 4 && lower.includes(displayName.toLowerCase())) {
    problems.push('Don’t include your name in your password');
  }
  if (/^(.)\1+$/.test(password)) problems.push('Don’t repeat a single character');
  return problems;
}
