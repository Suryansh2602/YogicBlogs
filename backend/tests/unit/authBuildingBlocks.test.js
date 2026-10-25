// Unit tests for the small security primitives behind sign-in: durations, crypto, the ephemeral store,
// login lockout, the password policy, the breached-password check and reCAPTCHA verification.
import { describe, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';
import { durationToMs, durationToSeconds } from '../../src/utils/duration.js';
import { decryptSecret, encryptSecret, randomToken, safeEqual } from '../../src/utils/crypto.js';
import { createMemoryStore, createRedisStore } from '../../src/utils/ephemeralStore.js';
import { createLockout, LIMITS } from '../../src/modules/auth/lockout.service.js';
import { breachCount, passwordProblems } from '../../src/modules/auth/password.service.js';
import { emailProblem } from '../../src/modules/auth/auth.validation.js';
import { requireRecaptcha } from '../../src/middlewares/recaptcha.js';

const KEY = Buffer.alloc(32, 7).toString('base64url');

describe('durations', () => {
  it.each([
    ['30s', 30_000],
    ['15m', 900_000],
    ['1h', 3_600_000],
    ['7d', 604_800_000],
  ])('%s → %d ms', (value, ms) => {
    expect(durationToMs(value)).toBe(ms);
  });

  it('converts to whole seconds and rejects other formats', () => {
    expect(durationToSeconds('15m')).toBe(900);
    expect(() => durationToMs('15 minutes')).toThrow('Invalid duration');
  });
});

describe('crypto', () => {
  it('round-trips a secret with AES-256-GCM bound to its owner', () => {
    const payload = encryptSecret('JBSWY3DPEHPK3PXP', KEY, 'user-1');
    expect(payload).toMatch(/^v1\./);
    expect(decryptSecret(payload, KEY, 'user-1')).toBe('JBSWY3DPEHPK3PXP');
  });

  it('refuses a ciphertext moved to another user, tampered with or in an unknown format', () => {
    const payload = encryptSecret('secret', KEY, 'user-1');
    expect(() => decryptSecret(payload, KEY, 'user-2')).toThrow();
    const [v, iv, tag, ct] = payload.split('.');
    const flipped = `${ct[0] === 'A' ? 'B' : 'A'}${ct.slice(1)}`;
    expect(() => decryptSecret([v, iv, tag, flipped].join('.'), KEY, 'user-1')).toThrow();
    expect(() => decryptSecret('v0.a.b.c', KEY, 'user-1')).toThrow('Unsupported');
  });

  it('compares strings safely', () => {
    expect(safeEqual('abc', 'abc')).toBe(true);
    expect(safeEqual('abc', 'abd')).toBe(false);
    expect(safeEqual('abc', 'abcd')).toBe(false);
    expect(safeEqual('abc', undefined)).toBe(false);
    expect(randomToken()).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });
});

describe('memory ephemeral store', () => {
  it('expires entries, reads-and-deletes once, and counts within a window', async () => {
    let now = 0;
    const store = createMemoryStore({ now: () => now });
    await store.set('a', '1', 10);
    expect(await store.ttl('a')).toBe(10);
    expect(await store.getDel('a')).toBe('1');
    expect(await store.getDel('a')).toBeNull();

    expect(await store.incr('c', 60)).toBe(1);
    expect(await store.incr('c', 60)).toBe(2);
    now = 61_000;
    expect(await store.get('c')).toBeNull();
    expect(await store.ttl('c')).toBe(-2);
    expect(await store.incr('c', 60)).toBe(1);

    await store.set('d', 'x', 5);
    await store.del('d');
    expect(await store.get('d')).toBeNull();
    store.clear();
  });
});

describe('redis ephemeral store', () => {
  it('prefixes keys and only sets the window TTL on the first increment', async () => {
    const client = {
      get: vi.fn(),
      set: vi.fn(),
      getDel: vi.fn(),
      del: vi.fn(),
      incr: vi.fn().mockResolvedValueOnce(1).mockResolvedValueOnce(2),
      expire: vi.fn(),
      ttl: vi.fn(),
    };
    const store = createRedisStore(client);
    await store.set('k', 'v', 30);
    expect(client.set).toHaveBeenCalledWith('hm:k', 'v', { expiration: { type: 'EX', value: 30 } });
    await store.incr('n', 60);
    await store.incr('n', 60);
    expect(client.expire).toHaveBeenCalledTimes(1);
    await Promise.all([store.get('k'), store.getDel('k'), store.del('k'), store.ttl('k')]);
    for (const fn of [client.get, client.getDel, client.del, client.ttl]) expect(fn).toHaveBeenCalledWith('hm:k');
  });
});

describe('login lockout', () => {
  it('locks one IP + account after 5 failures, and clears on success', async () => {
    const lockout = createLockout(createMemoryStore());
    for (let i = 0; i < LIMITS.ipAccount.max; i += 1) await lockout.recordFailure('1.1.1.1', 'Meera@example.com');
    const err = await lockout.assertNotLocked('1.1.1.1', 'meera@example.com').catch((e) => e);
    expect(err).toMatchObject({ statusCode: 429, code: 'LOGIN_LOCKED' });
    expect(err.retryAfter).toBeGreaterThan(0);

    // Another IP can still try the same account (until the account-wide limit).
    await expect(lockout.assertNotLocked('2.2.2.2', 'meera@example.com')).resolves.toBeUndefined();
    await lockout.clear('1.1.1.1', 'meera@example.com');
    await expect(lockout.assertNotLocked('1.1.1.1', 'meera@example.com')).resolves.toBeUndefined();
  });

  it('locks an account guessed from many IPs after 20 failures', async () => {
    const lockout = createLockout(createMemoryStore());
    for (let i = 0; i < LIMITS.account.max; i += 1) await lockout.recordFailure(`10.0.0.${i}`, 'meera@example.com');
    await expect(lockout.assertNotLocked('10.0.0.99', 'meera@example.com')).rejects.toMatchObject({ code: 'LOGIN_LOCKED' });
  });
});

describe('password policy', () => {
  it('accepts a long passphrase', () => {
    expect(passwordProblems('Banyan-roots-run-deep', { email: 'meera@example.com', displayName: 'Meera' })).toEqual([]);
  });

  it('says exactly what is wrong, without repeating the password', () => {
    expect(passwordProblems('short')).toEqual(['Your password has 5 characters. Use at least 12.']);
    expect(passwordProblems('x')).toEqual(['Your password has 1 character. Use at least 12.']);
    expect(passwordProblems('x'.repeat(129))).toContain('Your password has 129 characters. The limit is 128.');
    expect(passwordProblems('aaaaaaaaaaaaaa')).toContain('Your password is one character repeated. Mix in other characters.');
    expect(passwordProblems('meera-loves-yoga', { email: 'meera@example.com' })).toContain('Your password contains “meera” from your email address. Remove it.');
    expect(passwordProblems('i-am-suryansh-123', { displayName: 'Suryansh' })).toContain('Your password contains your name. Remove it.');
    for (const message of passwordProblems('secretpw', { email: 'secretpw@example.com' })) {
      expect(message.replace('“secretpw”', '')).not.toContain('secretpw');
    }
  });

  it('describes what is wrong with an email address', () => {
    expect(emailProblem('')).toBe('Enter your email address.');
    expect(emailProblem('meera gmail.com')).toMatch(/contains a space/);
    expect(emailProblem('meeragmail.com')).toMatch(/missing the “@”/);
    expect(emailProblem('a@b@c.com')).toMatch(/more than one “@”/);
    expect(emailProblem('@gmail.com')).toMatch(/before the “@”/);
    expect(emailProblem('meera@')).toMatch(/after the “@”/);
    expect(emailProblem('meera@gmail')).toBe('“gmail” isn’t a complete domain. It needs an ending like .com or .in.');
    expect(emailProblem('meera@gmail.com')).toMatch(/Check it for typos/);
  });
});

describe('breached-password check (HIBP k-anonymity)', () => {
  const sha1 = createHash('sha1').update('password123456').digest('hex').toUpperCase();
  const reply = (body, ok = true) => vi.fn().mockResolvedValue({ ok, text: () => Promise.resolve(body) });

  it('sends only the 5-character prefix and matches the suffix', async () => {
    const fetchImpl = reply(`0000000000000000000000000000000000A:0\r\n${sha1.slice(5)}:42\r\n`);
    expect(await breachCount('password123456', { fetchImpl, enabled: true })).toBe(42);
    expect(fetchImpl.mock.calls[0][0]).toBe(`https://api.pwnedpasswords.com/range/${sha1.slice(0, 5)}`);
    expect(fetchImpl.mock.calls[0][0]).not.toContain(sha1.slice(5));
  });

  it('ignores padding entries with a zero count', async () => {
    expect(await breachCount('password123456', { fetchImpl: reply(`${sha1.slice(5)}:0`), enabled: true })).toBe(0);
  });

  it('fails open on errors and outages, and is skipped when disabled', async () => {
    expect(await breachCount('x', { fetchImpl: vi.fn().mockRejectedValue(new Error('timeout')), enabled: true })).toBe(0);
    expect(await breachCount('x', { fetchImpl: reply('', false), enabled: true })).toBe(0);
    const fetchImpl = vi.fn();
    expect(await breachCount('x', { fetchImpl, enabled: false })).toBe(0);
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

describe('reCAPTCHA v3 verification', () => {
  const good = { success: true, action: 'register', hostname: 'localhost', score: 0.9, challenge_ts: new Date().toISOString() };
  const google = (body) => vi.fn().mockResolvedValue({ json: () => Promise.resolve(body) });
  const run = async (middleware, body = { captchaToken: 'a-valid-looking-token' }) => {
    const req = { body, ip: '1.2.3.4' };
    const next = vi.fn();
    await middleware(req, {}, next);
    return { req, err: next.mock.calls[0][0] };
  };
  const live = (fetchImpl, extra) => requireRecaptcha('register', { mode: 'live', secret: 's', fetchImpl, minScore: 0.5, ...extra });

  it('lets a good token through and records the score', async () => {
    const { req, err } = await run(live(google(good)));
    expect(err).toBeUndefined();
    expect(req.recaptchaScore).toBe(0.9);
  });

  it.each([
    ['a low score', { score: 0.1 }],
    ['another action', { action: 'login' }],
    ['another site', { hostname: 'evil.example' }],
    ['an old token', { challenge_ts: new Date(Date.now() - 10 * 60_000).toISOString() }],
    ['a failed check', { success: false }],
  ])('rejects %s', async (_label, change) => {
    const { err } = await run(live(google({ ...good, ...change })));
    expect(err).toMatchObject({ statusCode: 400, code: 'CAPTCHA_FAILED' });
  });

  it('rejects a missing token without calling Google', async () => {
    const fetchImpl = vi.fn();
    const { err } = await run(live(fetchImpl), {});
    expect(err).toMatchObject({ code: 'CAPTCHA_FAILED' });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('fails closed by default and open only where configured when Google is unreachable', async () => {
    const down = () => vi.fn().mockRejectedValue(new Error('ECONNRESET'));
    expect((await run(live(down()))).err).toMatchObject({ statusCode: 503 });
    expect((await run(live(down(), { failOpen: true }))).err).toBeUndefined();
  });

  it('is skipped when switched off (development)', async () => {
    const { err } = await run(requireRecaptcha('register', { mode: 'off' }), {});
    expect(err).toBeUndefined();
  });
});
