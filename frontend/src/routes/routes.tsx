import type { ReactNode } from 'react';
import type { RouteObject } from 'react-router';
import Layout from '../components/layout/Layout';
import HomePage from '../pages/HomePage';
import NotFoundPage from '../pages/NotFoundPage';
import { GuestOnly, RequireAuth } from '../features/auth/guards';
import {
  AdminAudit,
  AdminGate,
  AdminOverview,
  AdminSetupPage,
  AdminUsers,
  CheckEmailPage,
  DashboardPage,
  ForgotPasswordPage,
  LegalPage,
  ResetPasswordPage,
  SignInPage,
  SignUpPage,
  VerifyEmailPage,
} from './lazyPages';

// Route objects are shared by the browser router (main.tsx) and the memory router in tests.
const guest = (element: ReactNode) => <GuestOnly>{element}</GuestOnly>;

export const routes: RouteObject[] = [
  {
    path: '/',
    element: <Layout />,
    children: [
      { index: true, element: <HomePage /> },
      { path: 'signin', element: guest(<SignInPage />) },
      { path: 'signup', element: guest(<SignUpPage />) },
      { path: 'check-email', element: <CheckEmailPage /> },
      { path: 'verify-email', element: <VerifyEmailPage /> },
      { path: 'forgot-password', element: guest(<ForgotPasswordPage />) },
      { path: 'reset-password', element: <ResetPasswordPage /> },
      {
        path: 'dashboard',
        element: (
          <RequireAuth>
            <DashboardPage />
          </RequireAuth>
        ),
      },
      { path: 'terms', element: <LegalPage doc="terms" /> },
      { path: 'privacy', element: <LegalPage doc="privacy" /> },
      { path: 'admin/setup', element: <AdminSetupPage /> },
      {
        path: 'admin',
        element: <AdminGate />,
        children: [
          { index: true, element: <AdminOverview /> },
          { path: 'users', element: <AdminUsers /> },
          { path: 'audit', element: <AdminAudit /> },
        ],
      },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
];
