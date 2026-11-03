import { lazy, type ComponentType } from 'react';
import type { PrerenderPath } from '../prerender/paths';

/**
 * A page loaded on demand, with `preload()`. Once its code has loaded, the page renders at once instead of
 * suspending. That matters for prerendered pages: a part still waiting for its code when anything updates
 * (the sign-in check, say) is thrown away and rebuilt, which loses the prerendered HTML.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- the same constraint as React.lazy's own
function lazyPage<T extends ComponentType<any>>(load: () => Promise<{ default: T }>) {
  let loaded: { default: T } | undefined;
  const preload = () =>
    load().then((module) => {
      loaded = module;
      return module;
    });
  // A thenable that answers straight away, so React.lazy resolves without suspending.
  const ready = (module: { default: T }) => ({ then: (resolve: (m: { default: T }) => void) => { resolve(module); } }) as unknown as Promise<{ default: T }>;
  return Object.assign(
    lazy(() => (loaded ? ready(loaded) : preload())),
    { preload },
  );
}

// Every page except the home page is loaded on demand, so a visitor downloads only what they open.
export const SignInPage = lazyPage(() => import('../pages/auth/SignInPage'));
export const SignUpPage = lazyPage(() => import('../pages/auth/SignUpPage'));
export const CheckEmailPage = lazyPage(() => import('../pages/auth/CheckEmailPage'));
export const VerifyEmailPage = lazyPage(() => import('../pages/auth/VerifyEmailPage'));
export const ForgotPasswordPage = lazyPage(() => import('../pages/auth/ForgotPasswordPage'));
export const ResetPasswordPage = lazyPage(() => import('../pages/auth/ResetPasswordPage'));
export const DashboardPage = lazyPage(() => import('../pages/dashboard/DashboardPage'));
export const LegalPage = lazyPage(() => import('../pages/LegalPage'));
export const AdminGate = lazyPage(() => import('../pages/admin/AdminGate'));
export const AdminSetupPage = lazyPage(() => import('../pages/admin/AdminSetupPage'));
export const AdminRecoverPage = lazyPage(() => import('../pages/admin/AdminRecoverPage'));
export const AdminSecurity = lazyPage(() => import('../pages/admin/AdminSecurity'));
export const AdminOverview = lazyPage(() => import('../pages/admin/AdminOverview'));
export const AdminUsers = lazyPage(() => import('../pages/admin/AdminUsers'));
export const AdminAudit = lazyPage(() => import('../pages/admin/AdminAudit'));
export const AdminConditions = lazyPage(() => import('../pages/admin/AdminConditions'));
export const AdminMedia = lazyPage(() => import('../pages/admin/AdminMedia'));
export const RitucharyaPage = lazyPage(() => import('../pages/RitucharyaPage'));
export const ArticlesPage = lazyPage(() => import('../pages/articles/ArticlesPage'));
export const ArticlePage = lazyPage(() => import('../pages/articles/ArticlePage'));
export const AdminArticles = lazyPage(() => import('../pages/admin/AdminArticles'));
// The editor (TipTap) is its own chunk: only admins who open an article ever download it.
export const AdminArticleEditor = lazyPage(() => import('../pages/admin/AdminArticleEditor'));

/** The code a prerendered page needs before React takes it over (Home has none: it is in the main bundle). */
export const PRERENDERED_PAGE_CODE: Record<PrerenderPath, (() => Promise<unknown>) | null> = {
  '/': null,
  '/ritucharya': RitucharyaPage.preload,
  '/articles': ArticlesPage.preload,
  '/terms': LegalPage.preload,
  '/privacy': LegalPage.preload,
};
