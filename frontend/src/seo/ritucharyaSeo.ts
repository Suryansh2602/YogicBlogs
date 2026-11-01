import type { RituId } from '../features/ritu/calendar';
import { RITU_NAMES } from '../features/ritu/names';
import { STATIC_PAGES } from './pages';
import type { SeoInput } from './useSeo';

const BASE = STATIC_PAGES.find((p) => p.path === '/ritucharya');

const pathFor = (ritu: RituId | null, hindi: boolean) => {
  const query = new URLSearchParams({ ...(ritu ? { ritu } : {}), ...(hindi ? { lang: 'hi' } : {}) }).toString();
  return query ? `/ritucharya?${query}` : '/ritucharya';
};

/** Each season, in each language, is its own page. With no season chosen, the page follows today's. */
export function ritucharyaSeo(ritu: RituId | null, hindi: boolean): SeoInput {
  const names = ritu ? RITU_NAMES[ritu] : null;
  const english = names
    ? {
        title: `${names.name} ritucharya (${names.english.toLowerCase()}): food and routine · Healthmarg`,
        description: `What to eat, how to move and what to avoid in ${names.name} (${names.english.toLowerCase()}), from Ayurveda’s guide to the six seasons.`,
      }
    : { title: BASE?.title ?? '', description: BASE?.description ?? '' };
  const hindiText = {
    title: names ? `${names.deva} ऋतुचर्या: आहार और दिनचर्या · Healthmarg` : 'ऋतुचर्या: छह ऋतुओं के साथ जीवन · Healthmarg',
    description: names ? `आयुर्वेद के अनुसार ${names.deva} ऋतु में क्या खाएँ, कैसे चलें और किससे बचें।` : 'आयुर्वेद की ऋतुचर्या: हर ऋतु में क्या खाएँ, कैसे चलें और किससे बचें।',
  };
  return {
    ...(hindi ? hindiText : english),
    path: pathFor(ritu, hindi),
    lang: hindi ? 'hi' : 'en',
    alternates: [
      { hreflang: 'en', path: pathFor(ritu, false) },
      { hreflang: 'hi', path: pathFor(ritu, true) },
      { hreflang: 'x-default', path: pathFor(ritu, false) },
    ],
  };
}
