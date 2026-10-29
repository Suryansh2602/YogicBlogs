import type { ReactNode } from 'react';
import type { RouteObject } from 'react-router';
import Layout from '../components/layout/Layout';
import HomePage from '../pages/HomePage';
import NotFoundPage from '../pages/NotFoundPage';
import RouteError from '../pages/RouteError';
import { GuestOnly, RequireAuth } from '../features/auth/guards';
import { EmailOnly } from '../features/auth/EmailOnly';
import {
  AdminAudit,
  AdminConditions,
  AdminMedia,
  RitucharyaPage,
  ArticlesPage,
  ArticlePage,
  AdminArticles,
  AdminArticleEditor,
  AdminGate,
  AdminOverview,
  AdminSetupPage,
  AdminRecoverPage,
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
    // If the site frame itself fails: a minimal page with the logo and a way home.
    errorElement: <RouteError standalone />,
    children: [
      {
        // A page that fails (a bug, or its code missing after an update) is shown inside the frame, so the
        // header, season strip and footer stay and readers can carry on.
        errorElement: <RouteError />,
        children: [
          { index: true, element: <HomePage /> },
          { path: 'signin', element: guest(<SignInPage />) },
          { path: 'signup', element: guest(<SignUpPage />) },
          // Email pages exist only while email features are on (see config/features.ts).
          {
            path: 'check-email',
            element: (
              <EmailOnly>
                <CheckEmailPage />
              </EmailOnly>
            ),
          },
          {
            path: 'verify-email',
            element: (
              <EmailOnly>
                <VerifyEmailPage />
              </EmailOnly>
            ),
          },
          { path: 'forgot-password', element: <EmailOnly>{guest(<ForgotPasswordPage />)}</EmailOnly> },
          {
            path: 'reset-password',
            element: (
              <EmailOnly>
                <ResetPasswordPage />
              </EmailOnly>
            ),
          },
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
          { path: 'ritucharya', element: <RitucharyaPage /> },
          { path: 'articles', element: <ArticlesPage /> },
          { path: 'articles/:slug', element: <ArticlePage /> },
          { path: 'admin/setup', element: <AdminSetupPage /> },
          { path: 'admin/recover', element: <AdminRecoverPage /> },
          {
            path: 'admin',
            element: <AdminGate />,
            children: [
              { index: true, element: <AdminOverview /> },
              { path: 'users', element: <AdminUsers /> },
              { path: 'audit', element: <AdminAudit /> },
              { path: 'articles', element: <AdminArticles /> },
              { path: 'articles/:id', element: <AdminArticleEditor /> },
              { path: 'conditions', element: <AdminConditions /> },
              { path: 'media', element: <AdminMedia /> },
            ],
          },
          { path: '*', element: <NotFoundPage /> },
        ],
      },
    ],
  },
];
