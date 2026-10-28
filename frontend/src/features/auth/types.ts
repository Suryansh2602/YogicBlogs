export type Role = 'user' | 'admin';

export interface User {
  id: string;
  email: string;
  displayName: string;
  role: Role;
  avatarUrl: string | null;
  emailVerified: boolean;
  twoFactorEnabled: boolean;
  createdAt: string;
}

export interface SessionResponse {
  accessToken: string;
  user: User;
  /** Only when 2FA was just turned on: shown to the user once. */
  backupCodes?: string[];
}

export interface MfaChallenge {
  mfaRequired?: true;
  mfaSetupRequired?: true;
  mfaTicket: string;
}

export type LoginResponse = SessionResponse | MfaChallenge;

export interface TwoFactorSetup {
  otpauthUrl: string;
  qrDataUrl: string;
  secret: string;
}

/** What the UI does after the password step. */
export type LoginOutcome =
  | { kind: 'session'; user: User }
  | { kind: 'mfa'; ticket: string }
  | { kind: 'mfaSetup'; ticket: string };
