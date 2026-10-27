import { createHash } from 'node:crypto';

/**
 * JSON with object keys sorted at every level, so the same content always gives the same text (and hash)
 * however it was built or read back from MySQL. undefined values are dropped, as JSON.stringify does.
 */
export function canonicalJson(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((v) => (v === undefined ? 'null' : canonicalJson(v))).join(',')}]`;
  const keys = Object.keys(value)
    .filter((k) => value[k] !== undefined)
    .sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalJson(value[k])}`).join(',')}}`;
}

/** SHA-256 (hex) of the canonical JSON. */
export const contentHash = (value) => createHash('sha256').update(canonicalJson(value)).digest('hex');
