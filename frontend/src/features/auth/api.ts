// Typed calls to the auth, users and admin endpoints (see docs/api.md).
import { apiClient } from '../../services/apiClient';
import { authed } from './session';
import type { LoginResponse, SessionResponse, TwoFactorSetup, User } from './types';

interface Message {
  message: string;
}

export interface RegisterInput {
  email: string;
  password: string;
  displayName: string;
  acceptTerms: true;
  acceptPrivacy: true;
  captchaToken?: string;
}

const withCaptcha = <T extends object>(body: T, captchaToken: string | undefined) => (captchaToken ? { ...body, captchaToken } : body);

export const authApi = {
  /** Email on: 202 "check your email". Email off: 201 with a session (signed in straight away). */
  register: (input: RegisterInput) => apiClient.post<Message | SessionResponse>('/auth/register', input),
  verifyEmail: (token: string) => apiClient.post<Message>('/auth/verify-email', { token }),
  resendVerification: (email: string, captchaToken?: string) =>
    apiClient.post<Message>('/auth/verify-email/resend', withCaptcha({ email }, captchaToken)),
  login: (email: string, password: string, { admin = false, captchaToken }: { admin?: boolean; captchaToken?: string | undefined } = {}) =>
    apiClient.post<LoginResponse>(admin ? '/auth/admin/login' : '/auth/login', withCaptcha({ email, password }, captchaToken)),
  verifySecondFactor: (mfaTicket: string, code: string) => apiClient.post<SessionResponse>('/auth/login/2fa', { mfaTicket, code }),
  beginTicketEnrolment: (mfaTicket: string) => apiClient.post<TwoFactorSetup>('/auth/login/2fa/setup', { mfaTicket }),
  enableTicketEnrolment: (mfaTicket: string, code: string) => apiClient.post<SessionResponse>('/auth/login/2fa/enable', { mfaTicket, code }),
  forgotPassword: (email: string, captchaToken?: string) => apiClient.post<Message>('/auth/password/forgot', withCaptcha({ email }, captchaToken)),
  resetPassword: (token: string, password: string) => apiClient.post<Message>('/auth/password/reset', { token, password }),
  logoutEverywhere: () => authed((o) => apiClient.post<null>('/auth/logout-all', undefined, o)),
  beginEnrolment: () => authed((o) => apiClient.post<TwoFactorSetup>('/auth/2fa/setup', undefined, o)),
  enableTwoFactor: (code: string) => authed((o) => apiClient.post<{ backupCodes: string[] }>('/auth/2fa/enable', { code }, o)),
};

export const usersApi = {
  me: () => authed((o) => apiClient.get<{ user: User }>('/users/me', o)),
  updateMe: (displayName: string) => authed((o) => apiClient.patch<{ user: User }>('/users/me', { displayName }, o)),
};

export interface AdminStats {
  users: number;
  admins: number;
  verified: number;
  suspended: number;
  newThisWeek: number;
  activeThisWeek: number;
}

export interface AdminUserRow {
  id: string;
  email: string;
  displayName: string;
  role: 'user' | 'admin';
  status: 'active' | 'suspended';
  emailVerified: boolean;
  lastLoginAt: string | null;
  createdAt: string;
}

export interface AuditRow {
  id: string | number;
  action: string;
  actorId: string | null;
  /** The acting account's email, looked up by the API (null for anonymous events). */
  actorEmail: string | null;
  entityType: string | null;
  entityId: string | null;
  ip: string | null;
  createdAt: string;
}

export interface Page<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
}

const query = (params: Record<string, string | number | undefined>) => {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) if (value !== undefined && value !== '') search.set(key, String(value));
  const text = search.toString();
  return text ? `?${text}` : '';
};

export interface RecoverableAdmin {
  id: string;
  email: string;
  displayName: string;
}

export const adminApi = {
  setupStatus: () => apiClient.get<{ setupRequired: boolean }>('/admin/setup/status'),
  setup: (input: { setupCode: string; email: string; password: string; displayName: string }) =>
    apiClient.post<{ user: User }>('/admin/setup', input),
  // Recovery with the server's setup code (docs/admin-recovery.md).
  recoveryLookup: (setupCode: string) => apiClient.post<{ admins: RecoverableAdmin[] }>('/admin/recover/lookup', { setupCode }),
  recover: (input: { setupCode: string; adminId: string; password: string }) => apiClient.post<{ email: string }>('/admin/recover', input),
  stats: () => authed((o) => apiClient.get<AdminStats>('/admin/stats', o)),
  users: (params: { page?: number; search?: string }) => authed((o) => apiClient.get<Page<AdminUserRow>>(`/admin/users${query({ pageSize: 20, ...params })}`, o)),
  auditLogs: (params: { page?: number; action?: string }) =>
    authed((o) => apiClient.get<Page<AuditRow>>(`/admin/audit-logs${query({ pageSize: 25, ...params })}`, o)),
};
