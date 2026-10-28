import { lazy } from 'react';

// Every page except the home page is loaded on demand, so a visitor downloads only what they open.
export const SignInPage = lazy(() => import('../pages/auth/SignInPage'));
export const SignUpPage = lazy(() => import('../pages/auth/SignUpPage'));
export const CheckEmailPage = lazy(() => import('../pages/auth/CheckEmailPage'));
export const VerifyEmailPage = lazy(() => import('../pages/auth/VerifyEmailPage'));
export const ForgotPasswordPage = lazy(() => import('../pages/auth/ForgotPasswordPage'));
export const ResetPasswordPage = lazy(() => import('../pages/auth/ResetPasswordPage'));
export const DashboardPage = lazy(() => import('../pages/dashboard/DashboardPage'));
export const LegalPage = lazy(() => import('../pages/LegalPage'));
export const AdminGate = lazy(() => import('../pages/admin/AdminGate'));
export const AdminSetupPage = lazy(() => import('../pages/admin/AdminSetupPage'));
export const AdminOverview = lazy(() => import('../pages/admin/AdminOverview'));
export const AdminUsers = lazy(() => import('../pages/admin/AdminUsers'));
export const AdminAudit = lazy(() => import('../pages/admin/AdminAudit'));
export const AdminConditions = lazy(() => import('../pages/admin/AdminConditions'));
export const AdminMedia = lazy(() => import('../pages/admin/AdminMedia'));
export const RitucharyaPage = lazy(() => import('../pages/RitucharyaPage'));
export const ArticlesPage = lazy(() => import('../pages/articles/ArticlesPage'));
export const ArticlePage = lazy(() => import('../pages/articles/ArticlePage'));
export const AdminArticles = lazy(() => import('../pages/admin/AdminArticles'));
// The editor (TipTap) is its own chunk: only admins who open an article ever download it.
export const AdminArticleEditor = lazy(() => import('../pages/admin/AdminArticleEditor'));
