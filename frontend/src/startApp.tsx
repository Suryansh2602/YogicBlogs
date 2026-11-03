// Starts the app in #root. Public pages arrive with their HTML built in advance (docs/page-speed.md): React
// takes that HTML over (hydrates) instead of building the page again. Used by main.tsx and by the tests.
import { StrictMode } from 'react';
import { createRoot, hydrateRoot, type Root } from 'react-dom/client';
import { createBrowserRouter, RouterProvider } from 'react-router';
import { AppProviders } from './AppProviders';
import { normalizePath, PRERENDER_PATHS, type PrerenderPath } from './prerender/paths';
import { PRERENDERED_PAGE_CODE } from './routes/lazyPages';
import { routes } from './routes/routes';
import { reportError } from './services/errorReporting';

const isPrerenderPath = (path: string | undefined): path is PrerenderPath => (PRERENDER_PATHS as readonly (string | undefined)[]).includes(path);

// React redraws a part whose HTML didn't match: the page still works, but report it so it gets fixed.
const reportMismatch = (error: unknown) => {
  reportError('crash', error);
};

export async function startApp(container: HTMLElement, { onRecoverableError = reportMismatch } = {}): Promise<Root> {
  const app = (
    <StrictMode>
      <AppProviders>
        <RouterProvider router={createBrowserRouter(routes)} />
      </AppProviders>
    </StrictMode>
  );

  const prerendered = container.dataset['prerendered'];
  if (isPrerenderPath(prerendered) && prerendered === normalizePath(window.location.pathname)) {
    // The page's own code first (the page links it, so it is usually here already): React then takes the
    // whole page over at once. If it fails to load, hydrate anyway; React tries again and reports the error.
    await PRERENDERED_PAGE_CODE[prerendered]?.().catch(() => undefined);
    return hydrateRoot(container, app, { onRecoverableError });
  }

  // No prerendered HTML, or HTML built for another address (a host's fallback; theme-init.js hid it).
  container.replaceChildren();
  delete container.dataset['prerendered'];
  document.documentElement.classList.remove('hm-shell');
  const root = createRoot(container);
  root.render(app);
  return root;
}
