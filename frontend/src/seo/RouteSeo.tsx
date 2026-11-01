import { useLocation } from 'react-router';
import { homeJsonLd } from './structuredData';
import { isPrivatePath, SITE_NAME, STATIC_PAGES } from './pages';
import { siteOrigin, useSeo, type SeoInput } from './useSeo';

/** Pages that set their own tags: Ritucharya (per season), articles, and "not found". */
function routeSeo(pathname: string): SeoInput | null {
  const path = pathname.replace(/\/+$/, '') || '/';
  if (isPrivatePath(path)) return { title: SITE_NAME, path, noindex: true };
  const page = STATIC_PAGES.find((p) => p.path === path && p.path !== '/ritucharya');
  if (!page) return null;
  return path === '/' ? { ...page, jsonLd: homeJsonLd(siteOrigin()) } : page;
}

/** Sets the tags for the fixed pages and marks private ones noindex. Lives in the site frame. */
export function RouteSeo() {
  const { pathname } = useLocation();
  useSeo(routeSeo(pathname));
  return null;
}
