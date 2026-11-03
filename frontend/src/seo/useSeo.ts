// Keeps the page's <head> right as the reader moves around. Tags are updated in place, because React's
// own <title> would land after the one in index.html, and browsers use the first.
import { useEffect } from 'react';
import { DEFAULT_DESCRIPTION, DEFAULT_IMAGE, SITE_NAME } from './pages';

export interface SeoInput {
  title: string;
  /** The page's address: path, plus the query only when it changes the content. */
  path: string;
  description?: string | null | undefined;
  /** An absolute address, or a path on this site. */
  image?: string | null | undefined;
  type?: 'website' | 'article';
  noindex?: boolean;
  /** The language of the page's text; English when left out. */
  lang?: string;
  alternates?: readonly { hreflang: string; path: string }[];
  jsonLd?: readonly object[];
}

// While prerendering there is no window: the tags are applied in the browser anyway (useSeo is an effect).
export const siteOrigin = () => import.meta.env.VITE_SITE_URL ?? (typeof window === 'undefined' ? 'https://healthmarg.invalid' : window.location.origin);
const absolute = (path: string) => new URL(path, siteOrigin()).href;

function setMeta(attribute: 'name' | 'property', key: string, content: string) {
  let tag = document.head.querySelector<HTMLMetaElement>(`meta[${attribute}="${key}"]`);
  if (!tag) {
    tag = document.createElement('meta');
    tag.setAttribute(attribute, key);
    document.head.append(tag);
  }
  tag.content = content;
}

function setCanonical(href: string | null) {
  let link = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
  if (!href) {
    link?.remove();
    return;
  }
  if (!link) {
    link = document.createElement('link');
    link.rel = 'canonical';
    document.head.append(link);
  }
  link.href = href;
}

function setAlternates(alternates: SeoInput['alternates'] = []) {
  document.head.querySelectorAll('link[rel="alternate"][hreflang]').forEach((link) => {
    link.remove();
  });
  for (const { hreflang, path } of alternates) {
    const link = document.createElement('link');
    link.rel = 'alternate';
    link.hreflang = hreflang;
    link.href = absolute(path);
    document.head.append(link);
  }
}

function setJsonLd(jsonLd: SeoInput['jsonLd'] = []) {
  document.getElementById('seo-jsonld')?.remove();
  if (!jsonLd.length) return;
  const script = document.createElement('script');
  script.id = 'seo-jsonld';
  script.type = 'application/ld+json';
  script.textContent = JSON.stringify(jsonLd).replaceAll('<', '\\u003c');
  document.head.append(script);
}

export function applySeo({ title, path, description, image, type = 'website', noindex = false, lang = 'en', alternates, jsonLd }: SeoInput) {
  const text = description ?? DEFAULT_DESCRIPTION;
  document.title = title;
  document.documentElement.lang = lang;
  setMeta('name', 'description', text);
  setMeta('property', 'og:site_name', SITE_NAME);
  setMeta('property', 'og:title', title);
  setMeta('property', 'og:description', text);
  setMeta('property', 'og:type', type);
  setMeta('property', 'og:image', absolute(image ?? DEFAULT_IMAGE));
  setMeta('property', 'og:url', absolute(path));
  setMeta('name', 'twitter:card', 'summary_large_image');
  if (noindex) setMeta('name', 'robots', 'noindex');
  else document.head.querySelector('meta[name="robots"]')?.remove();
  setCanonical(noindex ? null : absolute(path));
  setAlternates(noindex ? [] : alternates);
  setJsonLd(noindex ? [] : jsonLd);
}

/** Pass null while the page doesn't know yet (an article still loading). */
export function useSeo(seo: SeoInput | null) {
  const wanted = JSON.stringify(seo);
  useEffect(() => {
    const input = JSON.parse(wanted) as SeoInput | null;
    if (input) applySeo(input);
  }, [wanted]);
}
