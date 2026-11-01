// Which setup code counts (panel, then .env, then the temporary startup code for first-time setup only),
// and removing the panel code is refused when .env has no code to fall back to.
import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({ envCode: undefined, panelHash: null }));

vi.mock('../../src/config/env.js', async (importOriginal) => {
  const { env } = await importOriginal();
  return {
    env: new Proxy(env, { get: (target, key) => (key === 'ADMIN_SETUP_CODE' ? state.envCode : target[key]) }),
  };
});
vi.mock('../../src/config/db.js', () => ({
  models: {
    AdminSecurity: { scope: () => ({ findByPk: () => Promise.resolve(state.panelHash ? { setupCodeHash: state.panelHash } : null) }) },
    User: {
      scope: () => ({ findByPk: () => Promise.resolve({ id: 'u1', email: 'a@example.com', passwordHash: 'hash-of-password' }) }),
    },
  },
}));
vi.mock('../../src/services/audit.js', () => ({ audit: vi.fn() }));
vi.mock('../../src/modules/auth/password.service.js', () => ({
  hashPassword: vi.fn((v) => Promise.resolve(`hash-of-${v}`)),
  verifyPassword: vi.fn((hash, v) => Promise.resolve(hash === `hash-of-${v}`)),
}));
vi.mock('../../src/modules/auth/twoFactor.service.js', () => ({ verifyTotp: vi.fn(() => Promise.resolve(true)) }));

const { checkSetupCode, codeSource, removePanelCode, temporaryCode } = await import('../../src/modules/admin/setupCode.service.js');

beforeEach(() => {
  state.envCode = undefined;
  state.panelHash = null;
});

describe('which setup code counts', () => {
  it('the panel code wins over .env, and .env no longer works while it is set', async () => {
    state.envCode = 'env-code-env-code-env-code';
    state.panelHash = 'hash-of-panel-code-panel-code-panel';
    expect(await codeSource()).toBe('panel');
    expect(await checkSetupCode('panel-code-panel-code-panel')).toBe(true);
    expect(await checkSetupCode('env-code-env-code-env-code')).toBe(false);
  });

  it('without a panel code, .env counts', async () => {
    state.envCode = 'env-code-env-code-env-code';
    expect(await codeSource()).toBe('env');
    expect(await checkSetupCode('env-code-env-code-env-code')).toBe(true);
    expect(await checkSetupCode('something-else-entirely')).toBe(false);
  });

  it('with no code anywhere: recovery has none (null), first-time setup accepts only the temporary code', async () => {
    expect(await codeSource()).toBe('none');
    expect(await checkSetupCode('anything-at-all-here')).toBeNull();
    expect(await checkSetupCode(temporaryCode(), { allowTemporary: true })).toBe(true);
    expect(await checkSetupCode('anything-at-all-here', { allowTemporary: true })).toBe(false);
  });
});

describe('removing the panel code', () => {
  it('is refused when .env has no code, because recovery would become impossible', async () => {
    state.panelHash = 'hash-of-panel-code-panel-code-panel';
    await expect(removePanelCode('u1', { password: 'password', totpCode: '123456' }, {})).rejects.toMatchObject({ statusCode: 409, code: 'NO_FALLBACK' });
  });
});
