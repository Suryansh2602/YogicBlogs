import { createContext } from 'react';
import type { LoginOutcome, TwoFactorSetup, User } from './types';

export type AuthStatus = 'loading' | 'authenticated' | 'anonymous';

export interface AuthContextValue {
  status: AuthStatus;
  user: User | null;
  /** Password step. `admin` uses the admin sign-in endpoint. */
  signIn: (email: string, password: string, options?: { admin?: boolean; captchaToken?: string | undefined }) => Promise<LoginOutcome>;
  /** 6-digit code or backup code for a pending sign-in. */
  completeSecondFactor: (ticket: string, code: string) => Promise<User>;
  /** Admin first sign-in: get the QR code for the pending enrolment. */
  beginTicketEnrolment: (ticket: string) => Promise<TwoFactorSetup>;
  /**
   * Admin first sign-in: confirm the first code; returns the backup codes (shown once). The session is
   * held back until `activatePendingSession()` so the panel doesn't replace the codes on screen.
   */
  enableTicketEnrolment: (ticket: string, code: string) => Promise<string[]>;
  signOut: () => Promise<void>;
  /** Replace the cached user after a profile change. */
  updateUser: (user: User) => void;
}

export const AuthContext = createContext<AuthContextValue | null>(null);
