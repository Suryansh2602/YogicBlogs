// Recovery needs a configured ADMIN_SETUP_CODE: without one it says so, and never accepts the
// temporary startup code (which disappears once the first admin exists).
import { describe, expect, it, vi } from 'vitest';

vi.mock('../../src/config/env.js', async (importOriginal) => {
  const { env } = await importOriginal();
  return { env: { ...env, ADMIN_SETUP_CODE: undefined } };
});
vi.mock('../../src/config/db.js', () => ({ models: { User: { findAll: vi.fn(), findOne: vi.fn() } }, sequelize: { transaction: vi.fn() } }));
vi.mock('../../src/services/audit.js', () => ({ audit: vi.fn() }));

const { models } = await import('../../src/config/db.js');
const { recoverAdmin, recoveryLookup } = await import('../../src/modules/admin/admin.service.js');

describe('admin recovery without ADMIN_SETUP_CODE', () => {
  it.each([
    ['looking up admins', () => recoveryLookup({ setupCode: 'any-code-at-all-123' }, {})],
    ['recovering an admin', () => recoverAdmin({ setupCode: 'any-code-at-all-123', adminId: '0190a1b2-c3d4-7000-8000-00000000000a', password: 'Monsoon-clouds-over-hills-7' }, {})],
  ])('refuses %s with 503 RECOVERY_NOT_CONFIGURED, touching nothing', async (_what, call) => {
    await expect(call()).rejects.toMatchObject({ statusCode: 503, code: 'RECOVERY_NOT_CONFIGURED' });
    expect(models.User.findAll).not.toHaveBeenCalled();
    expect(models.User.findOne).not.toHaveBeenCalled();
  });
});
