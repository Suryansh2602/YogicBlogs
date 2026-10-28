// Progressive login lockout, independent of the per-IP rate limit:
//  - IP + account: 5 failures in 15 min → locked 15 min (stops guessing one account from one place)
//  - account only: 20 failures in 1 h → locked 1 h (stops distributed guessing of one account)
// Keys use a hash of the email, so no email addresses sit in Redis.
import { ephemeralStore } from '../../utils/ephemeralStore.js';
import { sha256Hex } from '../../utils/crypto.js';
import { ApiError } from '../../utils/ApiError.js';

export const LIMITS = Object.freeze({
  ipAccount: { max: 5, windowSeconds: 15 * 60 },
  account: { max: 20, windowSeconds: 60 * 60 },
});

const keys = (ip, email) => {
  const account = sha256Hex(String(email).toLowerCase());
  return { ipAccount: `lf:ipacct:${sha256Hex(`${ip}|${account}`)}`, account: `lf:acct:${account}` };
};

export function createLockout(store = ephemeralStore) {
  return {
    async assertNotLocked(ip, email) {
      const k = keys(ip, email);
      const [ipAccount, account] = await Promise.all([store.get(k.ipAccount), store.get(k.account)]);
      if (Number(ipAccount) >= LIMITS.ipAccount.max || Number(account) >= LIMITS.account.max) {
        const retryAfter = Math.max(await store.ttl(k.ipAccount), await store.ttl(k.account), 1);
        const err = ApiError.tooManyRequests('Too many failed sign-in attempts. Please try again later.', 'LOGIN_LOCKED');
        err.retryAfter = retryAfter;
        throw err;
      }
    },
    async recordFailure(ip, email) {
      const k = keys(ip, email);
      await Promise.all([
        store.incr(k.ipAccount, LIMITS.ipAccount.windowSeconds),
        store.incr(k.account, LIMITS.account.windowSeconds),
      ]);
    },
    async clear(ip, email) {
      const k = keys(ip, email);
      await Promise.all([store.del(k.ipAccount), store.del(k.account)]);
    },
  };
}

export const lockout = createLockout();
