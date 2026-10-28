import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router';
import { PageLoader } from '../../components/ui/PageLoader';
import { useAuth } from './useAuth';
import type { Role } from './types';

/**
 * Only for signed-in users (optionally of a role). Signed-out visitors go to sign-in and come back
 * afterwards. These guards are for navigation only; the API enforces every permission itself.
 */
export function RequireAuth({ children, role }: { children: ReactNode; role?: Role }) {
  const { status, user } = useAuth();
  const location = useLocation();
  if (status === 'loading') return <PageLoader />;
  if (!user) return <Navigate to="/signin" replace state={{ from: location.pathname }} />;
  if (role && user.role !== role) return <Navigate to={user.role === 'admin' ? '/admin' : '/dashboard'} replace />;
  return children;
}

/** Sign-in/sign-up pages: a signed-in visitor goes straight to their dashboard. */
export function GuestOnly({ children }: { children: ReactNode }) {
  const { status, user } = useAuth();
  if (status === 'loading') return <PageLoader />;
  if (user) return <Navigate to={user.role === 'admin' ? '/admin' : '/dashboard'} replace />;
  return children;
}
