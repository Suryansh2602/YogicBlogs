// The build's prerender step (config/prerenderPlugin.ts) imports this from a server build of the app and
// renders each public page to HTML. The browser later hydrates that HTML with the same tree (main.tsx).
import { StrictMode } from 'react';
import { prerender } from 'react-dom/static';
import { createStaticHandler, createStaticRouter, StaticRouterProvider } from 'react-router';
import { AppProviders } from '../AppProviders';
import { routes } from '../routes/routes';
import { setPrerenderTime } from './hydration';

/** One page's HTML, as of `renderedAt` (ms). Waits for lazily loaded pages, so the HTML is complete. */
export async function renderPage(path: string, renderedAt: number): Promise<string> {
  setPrerenderTime(renderedAt);
  try {
    const handler = createStaticHandler(routes);
    const context = await handler.query(new Request(new URL(path, 'http://prerender.invalid')));
    if (context instanceof Response) throw new Error(`Prerendering ${path} answered ${String(context.status)}, not a page`);
    const router = createStaticRouter(handler.dataRoutes, context);
    const { prelude } = await prerender(
      <StrictMode>
        <AppProviders>
          {/* No hydration script: the routes have no loaders, and the CSP forbids inline scripts. */}
          <StaticRouterProvider router={router} context={context} hydrate={false} />
        </AppProviders>
      </StrictMode>,
      // Never move a large section to the end of the page: React would then reveal it with an inline
      // script, which the CSP blocks, leaving the page on its loading spinner. Everything stays in order.
      { progressiveChunkSize: Number.POSITIVE_INFINITY },
    );
    return await new Response(prelude).text();
  } finally {
    setPrerenderTime(null);
  }
}
