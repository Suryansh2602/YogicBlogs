// Fills the site's index.html for one article: the head a search engine or link preview reads, and a
// <noscript> copy of the text for readers and crawlers without JavaScript. It is the same page everyone
// gets, not a bot-only version. Article text is the owner's but is treated as hostile: everything is escaped.

const SITE_NAME = 'Healthmarg';

export const escapeHtml = (value) =>
  String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');

/** `<` is escaped so that no article text can close the script tag it sits in. */
const jsonLdScript = (data) => `<script id="seo-jsonld" type="application/ld+json">${JSON.stringify(data).replaceAll('<', '\\u003c')}</script>`;

const organization = (site) => ({
  '@type': 'Organization',
  '@id': `${site}/#organization`,
  name: SITE_NAME,
  url: `${site}/`,
  logo: `${site}/healthmarg-mark.svg`,
});

function articleJsonLd(article, { site, url, image }) {
  const crumbs = [
    { name: 'Home', item: `${site}/` },
    { name: 'Articles', item: `${site}/articles` },
    { name: article.title, item: url },
  ];
  return [
    {
      '@context': 'https://schema.org',
      '@type': 'Article',
      mainEntityOfPage: url,
      headline: article.title,
      description: article.seo.description ?? article.summary ?? undefined,
      image,
      inLanguage: article.lang,
      datePublished: article.publishedAt ?? undefined,
      dateModified: article.updatedAt ?? article.publishedAt ?? undefined,
      author: organization(site),
      publisher: organization(site),
      ...(article.accessLevel === 'public'
        ? {}
        : { isAccessibleForFree: false, hasPart: { '@type': 'WebPageElement', isAccessibleForFree: false, cssSelector: '.article-lock' } }),
    },
    {
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: crumbs.map((crumb, i) => ({ '@type': 'ListItem', position: i + 1, ...crumb })),
    },
  ];
}

const textOf = (node) => (node.type === 'text' ? (node.text ?? '') : node.type === 'hardBreak' ? ' ' : (node.content ?? []).map(textOf).join(''));

function blockHtml(node) {
  if (node.type === 'paragraph') return `<p>${escapeHtml(textOf(node))}</p>`;
  if (node.type === 'heading') {
    const level = Math.min(Math.max(Number(node.attrs?.level) || 2, 2), 4);
    return `<h${level}>${escapeHtml(textOf(node))}</h${level}>`;
  }
  if (node.type === 'verse') {
    const { devanagari, transliteration, meaning, source } = node.attrs ?? {};
    return `<blockquote>${[devanagari, transliteration, meaning, source].filter(Boolean).map((line) => `<p>${escapeHtml(line)}</p>`).join('')}</blockquote>`;
  }
  return (node.content ?? []).map(blockHtml).join('');
}

/** Replaces index.html's fixed head tags, and adds extra markup to the head and after the app's root. */
function fill(template, { title, head, noscript = '' }) {
  return template
    .replace(/<title>[^<]*<\/title>/, () => `<title>${escapeHtml(title)}</title>`)
    .replaceAll(/ *<meta (?:property="og:[a-z_]+"|name="description"|name="twitter:card") content="[^"]*" \/>\n?/g, '')
    .replace('</head>', () => `${head}</head>`)
    .replace('<div id="root"></div>', () => `<div id="root"></div>${noscript}`);
}

/** @param {{ site: string, image: string }} place the site's address, and the preview image's. */
export function articlePage(template, article, { site, image }) {
  const url = `${site}/articles/${encodeURIComponent(article.slug)}`;
  const description = article.seo.description ?? article.summary ?? '';
  const meta = (attribute, key, content) => `<meta ${attribute}="${key}" content="${escapeHtml(content)}" />`;
  const title = `${article.seo.title} · ${SITE_NAME}`;
  const head = [
    meta('name', 'description', description),
    `<link rel="canonical" href="${escapeHtml(url)}" />`,
    meta('property', 'og:site_name', SITE_NAME),
    meta('property', 'og:type', 'article'),
    meta('property', 'og:title', title),
    meta('property', 'og:description', description),
    meta('property', 'og:url', url),
    meta('property', 'og:image', image),
    meta('name', 'twitter:card', 'summary_large_image'),
    jsonLdScript(articleJsonLd(article, { site, url, image })),
  ].join('');
  const body = article.locked ? '' : (article.body?.content ?? []).map(blockHtml).join('');
  const noscript = `<noscript><article><h1>${escapeHtml(article.title)}</h1><p>${escapeHtml(article.summary)}</p>${body}</article></noscript>`;
  return fill(template, { title, head, noscript }).replace('<html lang="en">', () => `<html lang="${escapeHtml(article.lang)}">`);
}

/** The site's page, marked so that the address is never listed. */
export const missingPage = (template) => fill(template, { title: `Article not found · ${SITE_NAME}`, head: '<meta name="robots" content="noindex" />' });
