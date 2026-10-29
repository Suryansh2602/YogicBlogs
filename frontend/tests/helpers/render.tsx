import { StrictMode } from 'react';
import { render } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { routes } from '../../src/routes/routes';
import { ThemeProvider } from '../../src/theme/ThemeProvider';
import { AuthProvider } from '../../src/features/auth/AuthProvider';

/** Render the whole app (providers + real routes) at a path. Returns the router for location checks. */
export function renderApp(path = '/', state?: unknown) {
  window.history.replaceState(null, '', path);
  const router = createMemoryRouter(routes, { initialEntries: [{ pathname: path.split('?')[0] ?? path, search: path.includes('?') ? `?${path.split('?')[1] ?? ''}` : '', state }] });
  // StrictMode, as in main.tsx: React runs effects twice in development, which exposes effects that
  // aren't safe to repeat (like starting a 2FA setup twice).
  render(
    <StrictMode>
      <ThemeProvider>
        <AuthProvider>
          <RouterProvider router={router} />
        </AuthProvider>
      </ThemeProvider>
    </StrictMode>,
  );
  return router;
}

/** Mark this browser as having had a session, so the app tries to restore it on load. */
export const rememberSignedIn = () => {
  localStorage.setItem('hm-signed-in', '1');
};

/**
 * Import every lazily loaded page once, before a file's tests run. Pages are compiled on first import,
 * which can take seconds under coverage; preloading keeps each test's timing independent of that.
 */
export async function preloadPages() {
  await Promise.all([
    import('../../src/pages/auth/SignInPage'),
    import('../../src/pages/auth/SignUpPage'),
    import('../../src/pages/auth/CheckEmailPage'),
    import('../../src/pages/auth/VerifyEmailPage'),
    import('../../src/pages/auth/ForgotPasswordPage'),
    import('../../src/pages/auth/ResetPasswordPage'),
    import('../../src/pages/dashboard/DashboardPage'),
    import('../../src/pages/LegalPage'),
    import('../../src/pages/admin/AdminGate'),
    import('../../src/pages/admin/AdminSignIn'),
    import('../../src/pages/admin/AdminSetupPage'),
    import('../../src/pages/admin/AdminRecoverPage'),
    import('../../src/pages/admin/AdminOverview'),
    import('../../src/pages/admin/AdminUsers'),
    import('../../src/pages/admin/AdminAudit'),
    import('../../src/pages/admin/AdminConditions'),
    import('../../src/pages/admin/AdminMedia'),
    import('../../src/pages/RitucharyaPage'),
    import('../../src/pages/articles/ArticlesPage'),
    import('../../src/pages/articles/ArticlePage'),
    import('../../src/pages/admin/AdminArticles'),
    import('../../src/pages/admin/AdminArticleEditor'),
  ]);
}

/** The site header (the page's sections have <header>s too, so "banner" can match more than one). */
export function siteHeader(): HTMLElement {
  const header = document.querySelector<HTMLElement>('header.header');
  if (!header) throw new Error('The site header is not on the page');
  return header;
}

/** An element by id, or a clear failure. */
export function byId(id: string): HTMLElement {
  const element = document.getElementById(id);
  if (!element) throw new Error(`No element with id "${id}"`);
  return element;
}
