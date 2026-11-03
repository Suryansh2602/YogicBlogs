/** The public pages whose HTML is built in advance (docs/page-speed.md). Articles are served by the API. */
export const PRERENDER_PATHS = ['/', '/ritucharya', '/articles', '/terms', '/privacy'] as const;

export type PrerenderPath = (typeof PRERENDER_PATHS)[number];

/**
 * Each page's lazily loaded code, as the build's manifest names it (Home is in the main bundle). The build
 * links it from the page so it downloads alongside the main script, and the browser loads it before hydrating.
 */
export const PRERENDER_PAGE_MODULES: Record<PrerenderPath, string | null> = {
  '/': null,
  '/ritucharya': 'src/pages/RitucharyaPage.tsx',
  '/articles': 'src/pages/articles/ArticlesPage.tsx',
  '/terms': 'src/pages/LegalPage.tsx',
  '/privacy': 'src/pages/LegalPage.tsx',
};

/** "/ritucharya/" and "/ritucharya" are the same page. public/theme-init.js uses the same rule. */
export const normalizePath = (pathname: string) => pathname.replace(/\/+$/, '') || '/';
