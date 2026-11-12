import { STATIC_PAGES } from './pages';
import type { SeoInput } from './useSeo';

const BASE = STATIC_PAGES.find((p) => p.path === '/about');

/** The About page in English (/about) and Hindi (/about?lang=hi), linked to each other with hreflang. */
export function aboutSeo(hindi: boolean): SeoInput {
  const text = hindi
    ? {
        title: 'हमारे बारे में: हमारे स्रोत और हमारा काम · Healthmarg',
        description: 'हेल्थमार्ग चरक, सुश्रुत, अष्टांग हृदयम् और योग ग्रंथों से दिनचर्या, ऋतुचर्या, योग और जड़ी-बूटियों का ज्ञान रोज़मर्रा के जीवन में लाता है।',
      }
    : { title: BASE?.title ?? '', description: BASE?.description ?? '' };
  return {
    ...text,
    path: hindi ? '/about?lang=hi' : '/about',
    lang: hindi ? 'hi' : 'en',
    alternates: [
      { hreflang: 'en', path: '/about' },
      { hreflang: 'hi', path: '/about?lang=hi' },
      { hreflang: 'x-default', path: '/about' },
    ],
  };
}
