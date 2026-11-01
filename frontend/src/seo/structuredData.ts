// Structured data (schema.org JSON-LD): facts stated for search engines. It must match what the page shows,
// so nothing here claims a reviewer, an author's credentials or a health result.
import type { ReaderArticle } from '../features/articles/types';
import { DEFAULT_IMAGE, SITE_NAME } from './pages';

const CONTEXT = 'https://schema.org';

const organization = (site: string) => ({
  '@type': 'Organization',
  '@id': `${site}/#organization`,
  name: SITE_NAME,
  url: `${site}/`,
  logo: `${site}/healthmarg-mark.svg`,
});

export const homeJsonLd = (site: string) => [
  { '@context': CONTEXT, ...organization(site) },
  { '@context': CONTEXT, '@type': 'WebSite', '@id': `${site}/#website`, name: SITE_NAME, url: `${site}/`, publisher: { '@id': `${site}/#organization` } },
];

/** `image` is the article's cover as an absolute address, when it has one. */
export function articleJsonLd(site: string, article: ReaderArticle, image: string | null) {
  const url = `${site}/articles/${encodeURIComponent(article.slug)}`;
  const crumbs = [
    { name: 'Home', item: `${site}/` },
    { name: 'Articles', item: `${site}/articles` },
    { name: article.title, item: url },
  ];
  return [
    {
      '@context': CONTEXT,
      '@type': 'Article',
      mainEntityOfPage: url,
      headline: article.title,
      description: article.seo.description ?? article.summary ?? undefined,
      image: image ?? `${site}${DEFAULT_IMAGE}`,
      inLanguage: article.lang,
      datePublished: article.publishedAt ?? undefined,
      dateModified: article.updatedAt ?? article.publishedAt ?? undefined,
      author: organization(site),
      publisher: organization(site),
      // Members articles: the text never reaches a signed-out browser; this says so (Google's paywall markup).
      ...(article.accessLevel === 'public'
        ? {}
        : { isAccessibleForFree: false, hasPart: { '@type': 'WebPageElement', isAccessibleForFree: false, cssSelector: '.article-lock' } }),
    },
    {
      '@context': CONTEXT,
      '@type': 'BreadcrumbList',
      itemListElement: crumbs.map((crumb, i) => ({ '@type': 'ListItem', position: i + 1, ...crumb })),
    },
  ];
}
