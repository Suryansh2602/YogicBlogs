import { z } from 'zod';
import { ROLES } from '../../config/constants.js';
import { displayName, email, password } from '../auth/auth.validation.js';

const setupCode = z.string().min(16).max(200);
export const adminSetupSchema = z.object({ setupCode, email, password, displayName }).strict();
export const recoveryLookupSchema = z.object({ setupCode }).strict();
export const recoverAdminSchema = z.object({ setupCode, adminId: z.uuid(), password }).strict();

const page = z.coerce.number().int().min(1).max(10_000).default(1);
const pageSize = z.coerce.number().int().min(1).max(100).default(20);

export const listUsersQuery = z
  .object({ page, pageSize, search: z.string().trim().max(100).optional(), role: z.enum(Object.values(ROLES)).optional() })
  .strict();

export const listAuditLogsQuery = z
  .object({ page, pageSize, action: z.string().trim().max(64).regex(/^[a-z0-9_.]*$/).optional() })
  .strict();
