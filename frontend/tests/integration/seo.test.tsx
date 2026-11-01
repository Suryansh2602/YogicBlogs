// What search engines and link previews read: one title and description per page, a canonical address,
// noindex on private pages, Hindi and English linked, and structured data that can't break out of its tag.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { RouteSeo } from '../../src/seo/RouteSeo';
import { ritucharyaSeo } from '../../src/seo/ritucharyaSeo';
import { articleJsonLd } from '../../src/seo/structuredData';
import { isPrivatePath, STATIC_PAGES } from '../../src/seo/pages';
import { applySeo } from '../../src/seo/useSeo';
import type { ReaderArticle } from '../../src/features/articles/types';

const head = (selector: string) => document.head.querySelector(selector);
const content = (selector: string) => head(selector)?.getAttribute('content');
const canonical = () => head('link[rel="canonical"]')?.getAttribute('href');

const open = (path: string) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <RouteSeo />
    </MemoryRouter>,
  );

const ARTICLE = {
  slug: 'calm-breath',
  title: 'Calm breath',
  summary: 'A short summary.',
  lang: 'en',
  accessLevel: 'public',
  publishedAt: '2026-10-01T00:00:00.000Z',
  updatedAt: '2026-10-05T00:00:00.000Z',
  seo: { title: 'Calm breath', description: 'A short summary.' },
} as unknown as ReaderArticle;

beforeEach(() => {
  document.head.innerHTML = '';
  document.documentElement.lang = 'en';
  vi.stubEnv('VITE_SITE_URL', 'https://healthmarg.example');
});

describe('fixed pages', () => {
  it('gives each page its own title, description and canonical address', async () => {
    open('/articles');
    await waitFor(() => {
      expect(document.title).toBe('Articles on yoga and Ayurveda · Healthmarg');
    });
    expect(content('meta[name="description"]')).toMatch(/referenced articles/);
    expect(canonical()).toBe('https://healthmarg.example/articles');
    expect(content('meta[property="og:url"]')).toBe('https://healthmarg.example/articles');
    expect(content('meta[property="og:image"]')).toBe('https://healthmarg.example/og-default.png');
    expect(head('meta[name="robots"]')).toBeNull();
  });

  it('keeps titles and descriptions unique and within what search results show', () => {
    expect(new Set(STATIC_PAGES.map((p) => p.title)).size).toBe(STATIC_PAGES.length);
    expect(new Set(STATIC_PAGES.map((p) => p.description)).size).toBe(STATIC_PAGES.length);
    for (const page of STATIC_PAGES) {
      expect(page.title.length).toBeLessThanOrEqual(60);
      expect(page.description.length).toBeLessThanOrEqual(160);
    }
  });

  it('describes the site on the home page with structured data', async () => {
    open('/');
    await waitFor(() => {
      expect(head('#seo-jsonld')).not.toBeNull();
    });
    const data = JSON.parse(head('#seo-jsonld')?.textContent ?? '[]') as { '@type': string }[];
    expect(data.map((d) => d['@type'])).toEqual(['Organization', 'WebSite']);
  });

  it('never lets a trailing slash create a second page', async () => {
    open('/articles/');
    await waitFor(() => {
      expect(canonical()).toBe('https://healthmarg.example/articles');
    });
  });
});

describe('private pages', () => {
  it.each(['/signin', '/signup', '/dashboard', '/reset-password', '/verify-email', '/admin', '/admin/users', '/admin/setup', '/admin/recover'])(
    '%s is marked noindex, with no canonical address',
    async (path) => {
      open(path);
      await waitFor(() => {
        expect(content('meta[name="robots"]')).toBe('noindex');
      });
      expect(canonical()).toBeUndefined();
    },
  );

  it('does not catch public pages with similar names', () => {
    expect(isPrivatePath('/administration')).toBe(false);
    expect(isPrivatePath('/articles/signin-tips')).toBe(false);
  });

  it('drops noindex and structured data when moving to the next page', () => {
    applySeo({ title: 'Home', path: '/', jsonLd: [{ '@type': 'WebSite' }] });
    applySeo({ title: 'Private', path: '/signin', noindex: true });
    expect(head('#seo-jsonld')).toBeNull();
    applySeo({ title: 'Public', path: '/articles' });
    expect(head('meta[name="robots"]')).toBeNull();
    expect(canonical()).toBe('https://healthmarg.example/articles');
  });
});

describe('Ritucharya', () => {
  it('gives each season its own address, linked in both languages', () => {
    const seo = ritucharyaSeo('vasanta', false);
    expect(seo.title).toBe('Vasanta ritucharya (spring): food and routine · Healthmarg');
    expect(seo.path).toBe('/ritucharya?ritu=vasanta');
    expect(seo.alternates?.map((a) => a.hreflang)).toEqual(['en', 'hi', 'x-default']);
    expect(seo.alternates?.[1]?.path).toBe('/ritucharya?ritu=vasanta&lang=hi');
  });

  it('sets the Hindi title and the page language', () => {
    applySeo(ritucharyaSeo('vasanta', true));
    expect(document.title).toContain('वसन्त');
    expect(document.documentElement.lang).toBe('hi');
    applySeo(ritucharyaSeo(null, false));
    expect(document.documentElement.lang).toBe('en');
    expect(head('link[hreflang="hi"]')?.getAttribute('href')).toBe('https://healthmarg.example/ritucharya?lang=hi');
  });
});

describe('article structured data', () => {
  const site = 'https://healthmarg.example';
  interface ArticleLd {
    headline?: string;
    dateModified?: string;
    isAccessibleForFree?: boolean;
    reviewedBy?: unknown;
    hasPart?: unknown;
    itemListElement?: unknown[];
  }
  const data = (article: ReaderArticle) => articleJsonLd(site, article, null) as unknown as [ArticleLd, ArticleLd];

  it('states the dates, and the organisation as author, for a public article', () => {
    const [article, crumbs] = data(ARTICLE);
    expect(article.headline).toBe('Calm breath');
    expect(article.dateModified).toBe('2026-10-05T00:00:00.000Z');
    expect(article.isAccessibleForFree).toBeUndefined();
    expect(article.reviewedBy).toBeUndefined();
    expect(crumbs.itemListElement).toHaveLength(3);
  });

  it('marks a members article as paywalled', () => {
    const [article] = data({ ...ARTICLE, accessLevel: 'members' });
    expect(article.isAccessibleForFree).toBe(false);
    expect(article.hasPart).toMatchObject({ cssSelector: '.article-lock' });
  });

  it('cannot close its script tag, whatever the title says', () => {
    applySeo({ title: 't', path: '/', jsonLd: articleJsonLd(site, { ...ARTICLE, title: '</script><script>alert(1)</script>' }, null) });
    const text = head('#seo-jsonld')?.textContent ?? '';
    expect(text).not.toContain('</script');
    expect(document.head.querySelectorAll('script')).toHaveLength(1);
  });
});
