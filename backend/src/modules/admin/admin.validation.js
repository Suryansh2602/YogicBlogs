import { z } from 'zod';
import { ROLES } from '../../config/constants.js';
import { displayName, email, password } from '../auth/auth.validation.js';

const setupCode = z.string().min(16).max(200);
export const adminSetupSchema = z.object({ setupCode, email, password, displayName }).strict();
export const recoveryLookupSchema = z.object({ setupCode }).strict();
export const recoverAdminSchema = z.object({ setupCode, adminId: z.uuid(), password }).strict();

// Changing the setup code from the Admin panel: the admin's password and a fresh 2FA code prove it's them.
const adminProof = { password: z.string().min(1).max(128), totpCode: z.string().regex(/^\d{6}$/, 'Enter the 6-digit code from your authenticator app.') };
export const changeSetupCodeSchema = z
  .object({
    ...adminProof,
    newCode: z.string().min(24, 'Use at least 24 characters for the setup code (Generate makes a strong one).').max(200).regex(/^\S+$/, 'The setup code can’t contain spaces.'),
  })
  .strict();
export const removeSetupCodeSchema = z.object(adminProof).strict();

const page = z.coerce.number().int().min(1).max(10_000).default(1);
const pageSize = z.coerce.number().int().min(1).max(100).default(20);

export const listUsersQuery = z
  .object({ page, pageSize, search: z.string().trim().max(100).optional(), role: z.enum(Object.values(ROLES)).optional() })
  .strict();

export const listAuditLogsQuery = z
  .object({ page, pageSize, action: z.string().trim().max(64).regex(/^[a-z0-9_.]*$/).optional() })
  .strict();
