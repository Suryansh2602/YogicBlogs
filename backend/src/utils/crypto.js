import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

/** URL-safe random token, e.g. for refresh tokens, email links, MFA tickets. 32 bytes = 256 bits. */
export const randomToken = (bytes = 32) => randomBytes(bytes).toString('base64url');

export const sha256Hex = (value) => createHash('sha256').update(value).digest('hex');

export const hmacHex = (key, value) => createHmac('sha256', key).update(value).digest('hex');

/** Constant-time string comparison (avoids leaking how many leading characters matched). */
export function safeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

const VERSION = 'v1';

/**
 * AES-256-GCM encryption for secrets at rest (e.g. TOTP secrets).
 * Output: "v1.<iv>.<tag>.<ciphertext>" (base64url). `aad` binds the ciphertext to its owner (e.g. user id),
 * so a ciphertext copied onto another row fails to decrypt. The version prefix allows key rotation later.
 */
export function encryptSecret(plaintext, keyBase64Url, aad) {
  const key = Buffer.from(keyBase64Url, 'base64url');
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  cipher.setAAD(Buffer.from(aad));
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [VERSION, iv.toString('base64url'), tag.toString('base64url'), ciphertext.toString('base64url')].join('.');
}

export function decryptSecret(payload, keyBase64Url, aad) {
  const [version, iv, tag, ciphertext] = String(payload).split('.');
  if (version !== VERSION || !iv || !tag || !ciphertext) throw new Error('Unsupported ciphertext format');
  const decipher = createDecipheriv('aes-256-gcm', Buffer.from(keyBase64Url, 'base64url'), Buffer.from(iv, 'base64url'));
  decipher.setAAD(Buffer.from(aad));
  decipher.setAuthTag(Buffer.from(tag, 'base64url'));
  return Buffer.concat([decipher.update(Buffer.from(ciphertext, 'base64url')), decipher.final()]).toString('utf8');
}
