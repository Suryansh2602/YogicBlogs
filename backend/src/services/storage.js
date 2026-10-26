// Media storage. Local disk now (UPLOAD_DIR); the same interface can be backed by Cloudflare R2 later.
// Keys are always made by the server (e.g. "images/2026/10/<uuid>-960.webp"), never from a client's file
// name, and are checked so no key can point outside the storage root.
import { createReadStream } from 'node:fs';
import { mkdir, rename, rm, stat, statfs, writeFile } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import { dirname, resolve, sep } from 'node:path';
import { env } from '../config/env.js';

// A key is "folder/…/file": a lowercase folder, then segments of lowercase letters, digits, . _ -
const FIRST_SEGMENT = /^[a-z0-9]+$/;
const SEGMENT = /^[a-z0-9][a-z0-9._-]*$/;
const isSafeKey = (key) => {
  if (typeof key !== 'string' || key.length > 512 || key.includes('..')) return false;
  const [first, ...rest] = key.split('/');
  return FIRST_SEGMENT.test(first) && rest.length > 0 && rest.every((s) => SEGMENT.test(s));
};

export function createLocalStorage(root = resolve(env.UPLOAD_DIR)) {
  const base = resolve(root);

  /** Absolute path for a key; throws for anything that isn't a plain server-made key. */
  function pathFor(key) {
    if (!isSafeKey(key)) throw new Error(`Unsafe storage key: ${key}`);
    const full = resolve(base, key);
    if (!full.startsWith(base + sep)) throw new Error(`Storage key escapes the storage root: ${key}`);
    return full;
  }

  return {
    root: base,
    pathFor,

    /**
     * Write atomically: never a half-written image. A failed write removes its .part file; one left by a
     * crash is swept up at the next startup (cleanupStaleUploads).
     */
    async put(key, data) {
      const full = pathFor(key);
      const temp = `${full}.${randomBytes(6).toString('hex')}.part`;
      // Paths come from pathFor (validated, inside the storage root).
      // eslint-disable-next-line security/detect-non-literal-fs-filename
      await mkdir(dirname(full), { recursive: true });
      try {
        // eslint-disable-next-line security/detect-non-literal-fs-filename
        await writeFile(temp, data, { flag: 'wx' });
        // eslint-disable-next-line security/detect-non-literal-fs-filename
        await rename(temp, full);
      } catch (err) {
        await rm(temp, { force: true }).catch(() => {});
        throw err;
      }
    },

    async size(key) {
      // eslint-disable-next-line security/detect-non-literal-fs-filename
      return (await stat(pathFor(key))).size;
    },

    createReadStream(key) {
      // eslint-disable-next-line security/detect-non-literal-fs-filename
      return createReadStream(pathFor(key));
    },

    async remove(key) {
      await rm(pathFor(key), { force: true });
    },

    /** Free bytes on the disk that holds the storage root. */
    async freeBytes() {
      // eslint-disable-next-line security/detect-non-literal-fs-filename
      await mkdir(base, { recursive: true });
      const info = await statfs(base);
      return Number(info.bavail) * Number(info.bsize);
    },
  };
}

export const storage = createLocalStorage();
