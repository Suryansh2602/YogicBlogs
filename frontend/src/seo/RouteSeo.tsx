import { useLocation } from 'react-router';
import { homeJsonLd } from './structuredData';
import { isPrivatePath, SITE_NAME, STATIC_PAGES } from './pages';
import { siteOrigin, useSeo, type SeoInput } from './useSeo';

/** Pages that set their own tags (one per language or season): Ritucharya and About; also articles, and "not found". */
const OWN_TAGS = new Set(['/ritucharya', '/about']);

function routeSeo(pathname: string): SeoInput | null {
  const path = pathname.replace(/\/+$/, '') || '/';
  if (isPrivatePath(path)) return { title: SITE_NAME, path, noindex: true };
  const page = STATIC_PAGES.find((p) => p.path === path && !OWN_TAGS.has(p.path));
  if (!page) return null;
  return path === '/' ? { ...page, jsonLd: homeJsonLd(siteOrigin()) } : page;
}

/** Sets the tags for the fixed pages and marks private ones noindex. Lives in the site frame. */
export function RouteSeo() {
  const { pathname } = useLocation();
  useSeo(routeSeo(pathname));
  return null;
}
