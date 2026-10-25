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
 * Returns how many times the password appears in known breaches (0 = not found).
 * Fails open (returns 0) on timeout or network error so an outage never blocks sign-up.
 */
export async function breachCount(password, { fetchImpl = fetch, timeoutMs = 2_000, enabled = env.HIBP_ENABLED } = {}) {
  if (!enabled) return 0;
  const { createHash } = await import('node:crypto');
  const sha1 = createHash('sha1').update(password).digest('hex').toUpperCase();
  const prefix = sha1.slice(0, 5);
  const suffix = sha1.slice(5);
  try {
    const res = await fetchImpl(`https://api.pwnedpasswords.com/range/${prefix}`, {
      headers: { 'Add-Padding': 'true' },
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) return 0;
    const body = await res.text();
    for (const line of body.split('\n')) {
      const [hashSuffix, count] = line.trim().split(':');
      if (hashSuffix === suffix) return Number(count) || 0;
    }
    return 0;
  } catch (err) {
    logger.warn({ err: err.message, check: sha256Hex(prefix).slice(0, 8) }, 'Breached-password check unavailable');
    return 0;
  }
}

export const PASSWORD_MIN = 12;
export const PASSWORD_MAX = 128;

/**
 * Server-side policy (the frontend mirrors it for instant feedback, but this is the one that counts).
 * Each message says exactly what is wrong, without ever repeating the password itself.
 */
export function passwordProblems(password, { email, displayName } = {}) {
  const problems = [];
  const lower = password.toLowerCase();
  const emailName = email ? email.split('@')[0].toLowerCase() : '';
  const name = displayName ? displayName.trim().toLowerCase() : '';
  if (password.length < PASSWORD_MIN) {
    problems.push(`Your password has ${password.length} character${password.length === 1 ? '' : 's'}. Use at least ${PASSWORD_MIN}.`);
  }
  if (password.length > PASSWORD_MAX) {
    problems.push(`Your password has ${password.length} characters. The limit is ${PASSWORD_MAX}.`);
  }
  if (emailName.length >= 4 && lower.includes(emailName)) {
    problems.push(`Your password contains “${emailName}” from your email address. Remove it.`);
  }
  if (name.length >= 4 && lower.includes(name)) {
    problems.push('Your password contains your name. Remove it.');
  }
  if (password.length > 1 && /^(.)\1+$/.test(password)) {
    problems.push('Your password is one character repeated. Mix in other characters.');
  }
  return problems;
}
