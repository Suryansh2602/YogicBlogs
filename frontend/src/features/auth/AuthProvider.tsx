import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { authApi } from './api';
import { AuthContext, type AuthContextValue, type AuthStatus } from './AuthContext';
import { clearSession, holdPendingSession, mightHaveSession, onSessionChange, refreshSession, setSession, signOutSession } from './session';
import type { User } from './types';

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>('loading');
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    const unsubscribe = onSessionChange((next) => {
      setUser(next);
      setStatus(next ? 'authenticated' : 'anonymous');
    });
    // On page load, quietly restore the session from the HttpOnly refresh cookie, if this browser had one.
    if (mightHaveSession()) {
      refreshSession().catch(() => {
        clearSession();
      });
    } else {
      clearSession();
    }
    return unsubscribe;
  }, []);

  const signIn = useCallback<AuthContextValue['signIn']>(async (email, password, options = {}) => {
    const result = await authApi.login(email, password, options);
    if ('accessToken' in result) {
      setSession(result);
      return { kind: 'session', user: result.user };
    }
    return result.mfaSetupRequired ? { kind: 'mfaSetup', ticket: result.mfaTicket } : { kind: 'mfa', ticket: result.mfaTicket };
  }, []);

  const completeSecondFactor = useCallback(async (ticket: string, code: string) => {
    const session = await authApi.verifySecondFactor(ticket, code);
    setSession(session);
    return session.user;
  }, []);

  const beginTicketEnrolment = useCallback((ticket: string) => authApi.beginTicketEnrolment(ticket), []);

  const enableTicketEnrolment = useCallback(async (ticket: string, code: string) => {
    const session = await authApi.enableTicketEnrolment(ticket, code);
    holdPendingSession(session);
    return session.backupCodes ?? [];
  }, []);

  const signOut = useCallback(() => signOutSession(), []);
  const updateUser = useCallback((next: User) => {
    setUser(next);
  }, []);

  const value = useMemo(
    () => ({ status, user, signIn, completeSecondFactor, beginTicketEnrolment, enableTicketEnrolment, signOut, updateUser }),
    [status, user, signIn, completeSecondFactor, beginTicketEnrolment, enableTicketEnrolment, signOut, updateUser],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
