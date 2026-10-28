// Classical lines (public domain) with our own plain-English renderings. One is shown per day.
export interface Verse {
  sanskrit: string;
  transliteration: string;
  meaning: string;
  source: string;
}

export const VERSES: Verse[] = [
  { sanskrit: 'योगश्चित्तवृत्तिनिरोधः', transliteration: 'yogaś citta-vṛtti-nirodhaḥ', meaning: 'Yoga is the settling of the mind’s restless movements.', source: 'Yoga Sūtra 1.2' },
  { sanskrit: 'स्थिरसुखमासनम्', transliteration: 'sthira-sukham āsanam', meaning: 'A posture should be steady and at ease.', source: 'Yoga Sūtra 2.46' },
  { sanskrit: 'अभ्यासवैराग्याभ्यां तन्निरोधः', transliteration: 'abhyāsa-vairāgyābhyāṃ tan-nirodhaḥ', meaning: 'Steady practice and gentle letting go bring the mind to rest.', source: 'Yoga Sūtra 1.12' },
  { sanskrit: 'हेयं दुःखमनागतम्', transliteration: 'heyaṃ duḥkham anāgatam', meaning: 'Suffering that has not yet come can be avoided.', source: 'Yoga Sūtra 2.16' },
  { sanskrit: 'समदोषः समाग्निश्च', transliteration: 'sama-doṣaḥ samāgniś ca', meaning: 'Health is balance: of the doshas, and of the digestive fire.', source: 'Suśruta Saṃhitā, Sūtrasthāna 15.41' },
  { sanskrit: 'योगः कर्मसु कौशलम्', transliteration: 'yogaḥ karmasu kauśalam', meaning: 'Yoga is skill in action.', source: 'Bhagavad Gītā 2.50' },
  { sanskrit: 'सर्वे भवन्तु सुखिनः', transliteration: 'sarve bhavantu sukhinaḥ', meaning: 'May all beings be well and happy.', source: 'Traditional prayer' },
];

const FIRST_VERSE: Verse = VERSES[0] ?? { sanskrit: '', transliteration: '', meaning: '', source: '' };

export function verseOfTheDay(date = new Date()): Verse {
  const start = Date.UTC(date.getFullYear(), 0, 0);
  const day = Math.floor((Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) - start) / 86_400_000);
  return VERSES[day % VERSES.length] ?? FIRST_VERSE;
}

/** A greeting for the time of day, in Sanskrit/Hindi with its English sense. */
export function greeting(date = new Date()) {
  const hour = date.getHours();
  if (hour >= 4 && hour < 12) return { deva: 'सुप्रभातम्', english: 'Good morning' };
  if (hour >= 12 && hour < 17) return { deva: 'नमस्ते', english: 'Good afternoon' };
  if (hour >= 17 && hour < 21) return { deva: 'शुभ सन्ध्या', english: 'Good evening' };
  return { deva: 'शुभ रात्रि', english: 'Peaceful night' };
}
