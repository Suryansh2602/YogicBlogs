// What search engines and link previews see for each fixed page. The build step (config/seoPlugin.ts) and
// the running site (RouteSeo) both read this list, so the two can't disagree.
export const SITE_NAME = 'Healthmarg';
export const DEFAULT_DESCRIPTION =
  'Healthmarg: understand the causes of everyday conditions and find Ayurvedic ways to heal, guided by yoga practitioners.';
export const DEFAULT_IMAGE = '/og-default.png';

export interface PageSeo {
  path: string;
  title: string;
  description: string;
}

export const STATIC_PAGES: readonly PageSeo[] = [
  { path: '/', title: 'Healthmarg: yoga and Ayurveda for everyday health', description: DEFAULT_DESCRIPTION },
  {
    path: '/articles',
    title: 'Articles on yoga and Ayurveda · Healthmarg',
    description: 'Clear, referenced articles on everyday conditions, with the classical source and the research beside each claim.',
  },
  {
    path: '/ritucharya',
    title: 'Ritucharya: living by the six seasons · Healthmarg',
    description: 'Ritucharya is Ayurveda’s guide to the six seasons: what to eat, how to move and what to avoid as the year turns.',
  },
  { path: '/terms', title: 'Terms of Use · Healthmarg', description: 'The terms for using Healthmarg.' },
  { path: '/privacy', title: 'Privacy Policy · Healthmarg', description: 'How Healthmarg handles your information.' },
];

// Accounts, sign-in steps and the admin area: useful to their owner, and never a search result.
const PRIVATE = /^\/(signin|signup|check-email|verify-email|forgot-password|reset-password|dashboard|admin)(\/|$)/;

export const isPrivatePath = (path: string) => PRIVATE.test(path);
