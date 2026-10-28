// Just the names of the six ritus: what the home page's Today panel needs. Kept apart from the full
// Ritucharya content (ritucharya.ts) so the home page doesn't download all of it.
import type { RituId } from './calendar';

export const RITU_NAMES: Record<RituId, { name: string; deva: string; english: string }> = {
  shishira: { name: 'Shishira', deva: 'शिशिर', english: 'Late winter' },
  vasanta: { name: 'Vasanta', deva: 'वसन्त', english: 'Spring' },
  grishma: { name: 'Grishma', deva: 'ग्रीष्म', english: 'Summer' },
  varsha: { name: 'Varsha', deva: 'वर्षा', english: 'Monsoon' },
  sharad: { name: 'Sharad', deva: 'शरद्', english: 'Autumn' },
  hemanta: { name: 'Hemanta', deva: 'हेमन्त', english: 'Early winter' },
};
