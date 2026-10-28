// Ritucharya (seasonal regimen) content. Classical guidance follows Charaka Samhita (Sutrasthana 6),
// Ashtanga Hridaya (Sutrasthana 3) and Sushruta Samhita (Sutrasthana 6); yoga guidance draws on the Yoga
// Sutras, the Bhagavad Gita and the Hatha Yoga Pradipika; modern findings cite peer-reviewed studies
// (SOURCES below, each checked to exist). For education only: reviewed by the site's practitioners.
import type { RituId } from './calendar';

export type DoshaState = 'builds up' | 'aggravated' | 'settles' | 'steady';

export interface Ritu {
  id: RituId;
  name: string;
  deva: string;
  english: string;
  /** Lunar months (Ashtanga Hridaya) and the usual Gregorian dates of the solar ritu. */
  months: string;
  dates: string;
  kala: 'Adana (Uttarayana)' | 'Visarga (Dakshinayana)';
  /** What the season feels like, in a line. */
  mood: string;
  taste: string; // the rasa the season makes strongest
  strength: 'highest' | 'medium' | 'lowest';
  agni: string;
  doshas: { vata: DoshaState; pitta: DoshaState; kapha: DoshaState; note: string };
  body: { physical: string[]; mental: string[]; emotional: string[] };
  food: { favour: string[]; avoid: string[] };
  routine: string[];
  yoga: string[];
  pranayama: string[];
  exercise: string;
  protect: { condition: string; advice: string; source?: SourceId }[];
  sources: SourceId[];
}

export type SourceId =
  | 'charaka'
  | 'ashtanga'
  | 'sushruta'
  | 'yogaSutra'
  | 'gita'
  | 'hathaYoga'
  | 'thakkar2011'
  | 'alperovitch2009'
  | 'tseng2005'
  | 'jena2017'
  | 'innes2016'
  | 'chaddha2019'
  | 'rosenthal1984';

export interface Source {
  label: string;
  detail: string;
  href?: string;
}

export const SOURCES: Record<SourceId, Source> = {
  charaka: { label: 'Charaka Samhita', detail: 'Sutrasthana, chapter 6 (Tasyashitiya): the seasonal regimen, strength and digestion through the year.' },
  ashtanga: { label: 'Ashtanga Hridaya (Vagbhata)', detail: 'Sutrasthana, chapter 3 (Ritucharya): the six ritus, Adana and Visarga kala, the taste of each season, Ritusandhi.' },
  sushruta: { label: 'Sushruta Samhita', detail: 'Sutrasthana, chapter 6 (Ritucharya): seasons and the build-up, aggravation and settling of the doshas.' },
  yogaSutra: { label: 'Patanjali, Yoga Sutras', detail: '2.46 “sthira-sukham āsanam”: a posture should be steady and easy; 2.49–2.50: pranayama as the regulation of the breath.' },
  gita: { label: 'Bhagavad Gita', detail: '6.16–6.17: yoga is for one who is moderate (yukta) in eating, recreation, work, sleep and waking.' },
  hathaYoga: { label: 'Hatha Yoga Pradipika', detail: 'Chapter 2: the kumbhakas, including Surya Bhedana (warming), Ujjayi, Sitkari and Sheetali (cooling), Bhastrika and Bhramari.' },
  thakkar2011: {
    label: 'Thakkar J, et al. Ritucharya: answer to the lifestyle disorders.',
    detail: 'Ayu, 2011;32(4):466–471.',
    href: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC3665099/',
  },
  alperovitch2009: {
    label: 'Alpérovitch A, et al. Relationship between blood pressure and outdoor temperature in a large sample of elderly individuals: the Three-City study.',
    detail: 'Archives of Internal Medicine, 2009;169(1):75–80. In 8,801 people aged 65+, systolic pressure was on average about 5 mmHg higher in winter than in summer.',
    href: 'https://jamanetwork.com/journals/jamainternalmedicine/fullarticle/414703',
  },
  tseng2005: {
    label: 'Tseng CL, et al. Seasonal patterns in monthly hemoglobin A1c values.',
    detail: 'American Journal of Epidemiology, 2005;161(6):565–574. In 285,705 people with diabetes, HbA1c was higher in winter than in summer.',
    href: 'https://pubmed.ncbi.nlm.nih.gov/15746473/',
  },
  jena2017: {
    label: 'Jena AB, et al. Association between rainfall and diagnoses of joint or back pain: retrospective claims analysis.',
    detail: 'BMJ, 2017;359:j5326. In 1.5 million older adults, rainy days did not bring more visits for joint or back pain.',
    href: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC5728253/',
  },
  innes2016: {
    label: 'Innes KE, Selfe TK. Yoga for adults with type 2 diabetes: a systematic review of controlled trials.',
    detail: 'Journal of Diabetes Research, 2016:6979370. Yoga improved blood-sugar control in many trials; the authors call for larger, better studies.',
    href: 'https://www.ncbi.nlm.nih.gov/pmc/articles/PMC4691612/',
  },
  chaddha2019: {
    label: 'Chaddha A, et al. Device and non-device-guided slow breathing to reduce blood pressure: a systematic review and meta-analysis.',
    detail: 'Complementary Therapies in Medicine, 2019;45:179–184. Across 17 trials, slow breathing (including pranayama) lowered systolic pressure by about 5.6 mmHg on average; the trials varied a lot.',
    href: 'https://pubmed.ncbi.nlm.nih.gov/31331557/',
  },
  rosenthal1984: {
    label: 'Rosenthal NE, et al. Seasonal affective disorder: a description of the syndrome and preliminary findings with light therapy.',
    detail: 'Archives of General Psychiatry, 1984;41(1):72–80. Described depressions that return each year with the darker months, and early findings with light therapy.',
    href: 'https://pubmed.ncbi.nlm.nih.gov/6581756/',
  },
};

export const RITUS: readonly Ritu[] = [
  {
    id: 'shishira',
    name: 'Shishira',
    deva: 'शिशिर',
    english: 'Late winter',
    months: 'Magha – Phalguna',
    dates: 'about 14 January – 14 March',
    kala: 'Adana (Uttarayana)',
    mood: 'The coldest, driest days: crisp mornings, cold winds, bare trees.',
    taste: 'Bitter (tikta)',
    strength: 'highest',
    agni: 'Strong: the body asks for, and can digest, nourishing food.',
    doshas: {
      vata: 'steady',
      pitta: 'steady',
      kapha: 'builds up',
      note: 'Cold and moisture let Kapha quietly accumulate, ready to melt in spring. Dry, cold wind can also stir Vata in thin, older or anxious people.',
    },
    body: {
      physical: ['Digestion and strength are at their best', 'Dry skin, cracked lips and heels', 'Stiff joints on cold mornings', 'Colds and coughs come easily'],
      mental: ['Slower, inward, more reflective', 'Sleepiness on dark mornings'],
      emotional: ['Short days can lower mood in some people; morning sunlight helps'],
    },
    food: {
      favour: ['Warm, freshly cooked meals', 'Wheat, rice, millets like bajra and ragi', 'Ghee, milk, sesame (til), jaggery (gur)', 'Soups and seasonal vegetables cooked with ginger, garlic, pepper', 'Warm water through the day'],
      avoid: ['Cold drinks and refrigerated food', 'Dry, light, “diet” meals that leave you hungry', 'Long fasts: a strong digestive fire with nothing to burn weakens the body'],
    },
    routine: ['Oil massage (abhyanga) with warm sesame oil before bathing', 'Bathe in warm water', 'Morning sun for 15–20 minutes', 'Warm, layered clothes; cover head and ears in cold wind', 'Wake with the sun, keep to regular meals and sleep'],
    yoga: ['Surya Namaskar (Sun Salutations) to warm the body', 'Standing poses: Trikonasana, Virabhadrasana', 'Backbends: Bhujangasana, Dhanurasana', 'Joint-warming sequences before every practice'],
    pranayama: ['Surya Bhedana (right-nostril breathing): warming', 'Bhastrika (bellows breath), gently', 'Ujjayi during asana practice', 'Avoid cooling breaths (Sheetali, Sitkari) in this season'],
    exercise: 'Vigorous: strength is at its peak (Charaka advises exercise to half of one’s capacity, and winter tolerates the most).',
    protect: [
      { condition: 'High blood pressure', advice: 'Blood pressure tends to run higher in cold weather. Check it more often, keep warm, and do not change medicines without your doctor.', source: 'alperovitch2009' },
      { condition: 'Diabetes', advice: 'Blood sugar (HbA1c) is often higher in winter months: keep moving daily, watch sweets made with jaggery and ghee, and keep your usual checks.', source: 'tseng2005' },
      { condition: 'Arthritis', advice: 'Warm the joints before moving: oil massage, warm baths and gentle mobility in the morning; keep joints covered.' },
      { condition: 'Asthma and colds', advice: 'Avoid cold air and cold food; steam inhalation and warm ginger-tulsi water help; see a doctor for breathlessness.' },
    ],
    sources: ['ashtanga', 'charaka', 'hathaYoga', 'alperovitch2009', 'tseng2005', 'rosenthal1984'],
  },
  {
    id: 'vasanta',
    name: 'Vasanta',
    deva: 'वसन्त',
    english: 'Spring',
    months: 'Chaitra – Vaishakha',
    dates: 'about 15 March – 14 May',
    kala: 'Adana (Uttarayana)',
    mood: 'Blossoms, warming sun, new leaves and pollen in the air.',
    taste: 'Astringent (kashaya)',
    strength: 'medium',
    agni: 'Dulled: melting Kapha weighs on digestion.',
    doshas: {
      vata: 'steady',
      pitta: 'steady',
      kapha: 'aggravated',
      note: 'The Kapha stored through winter “melts” with the warming sun, so heaviness, phlegm and sluggish digestion are common.',
    },
    body: {
      physical: ['Heaviness, congestion, runny nose and allergies', 'Slower digestion, less appetite', 'A tendency to gain weight', 'Drowsiness after meals'],
      mental: ['Dullness and lethargy, especially after day sleep'],
      emotional: ['A season of renewal and hope, if heaviness is kept in check'],
    },
    food: {
      favour: ['Light, warm, easy-to-digest food', 'Barley, old wheat and rice, moong dal', 'Bitter, pungent and astringent tastes: methi, neem flowers, bitter gourd, ginger, black pepper', 'A little honey (never heated)', 'Warm water, ginger or dry-ginger water'],
      avoid: ['Heavy, oily, very sweet and sour food', 'Curd, cold drinks and ice cream', 'Sleeping in the day (it increases Kapha)'],
    },
    routine: ['Dry powder massage (udvartana) with chickpea flour helps reduce heaviness', 'Brisk morning walks', 'Gargle with warm salt water when the throat feels heavy', 'Avoid day sleep'],
    yoga: ['Surya Namaskar at a brisk pace', 'Twists: Ardha Matsyendrasana', 'Backbends that open the chest: Ushtrasana, Bhujangasana, Dhanurasana', 'Standing balances to build energy'],
    pranayama: ['Kapalabhati (skull-shining breath): clears heaviness', 'Bhastrika', 'Ujjayi', 'Nadi Shodhana to finish'],
    exercise: 'Vigorous: the best season to sweat out heaviness and work on weight.',
    protect: [
      { condition: 'Allergies and asthma', advice: 'Pollen season: keep windows closed on windy days, wash face after outdoor time, and keep inhalers handy if prescribed.' },
      { condition: 'Diabetes and weight', advice: 'Kapha season favours weight gain and sluggish sugar control: lighter meals and more movement. Yoga has helped blood-sugar control in trials.', source: 'innes2016' },
      { condition: 'Digestion', advice: 'Eat only when hungry, and keep the evening meal light and early.' },
    ],
    sources: ['ashtanga', 'charaka', 'hathaYoga', 'innes2016', 'thakkar2011'],
  },
  {
    id: 'grishma',
    name: 'Grishma',
    deva: 'ग्रीष्म',
    english: 'Summer',
    months: 'Jyeshtha – Ashadha',
    dates: 'about 15 May – 15 July',
    kala: 'Adana (Uttarayana)',
    mood: 'Blazing sun, hot winds and long, bright days.',
    taste: 'Pungent (katu)',
    strength: 'lowest',
    agni: 'Weak: heat drains strength, so food should be light and cooling.',
    doshas: {
      vata: 'builds up',
      pitta: 'steady',
      kapha: 'settles',
      note: 'Heat dries the body, so Vata (dryness, lightness) quietly builds up; Kapha settles. Too much sun and exertion also stir Pitta.',
    },
    body: {
      physical: ['Tiredness and low stamina', 'Thirst, dehydration, heat rashes', 'Less appetite', 'Poor sleep on hot nights'],
      mental: ['Shorter attention, mental fatigue in the afternoon'],
      emotional: ['Irritability and impatience in the heat'],
    },
    food: {
      favour: ['Sweet, cool, liquid, light food', 'Rice, moong, milk and ghee in moderation', 'Buttermilk (chaas) with roasted cumin, coconut water, sattu drink', 'Seasonal fruits: watermelon, muskmelon, mango (in moderation)', 'Water stored in an earthen pot'],
      avoid: ['Salty, sour, very spicy and fried food', 'Alcohol', 'Hard exercise in the heat', 'Going out in the midday sun'],
    },
    routine: ['A short afternoon rest is allowed in this season only', 'Light cotton clothes; cover the head in the sun', 'Bathe in cool (not icy) water', 'Evening walks in cool air'],
    yoga: ['Gentle, cooling practice early in the morning', 'Forward bends: Paschimottanasana, Balasana', 'Moon Salutations (Chandra Namaskar) instead of Sun Salutations', 'Long Shavasana'],
    pranayama: ['Sheetali (cooling breath through the curled tongue)', 'Sitkari (breath through the teeth)', 'Chandra Bhedana (left-nostril breathing)', 'Nadi Shodhana'],
    exercise: 'Light: walking, swimming, gentle yoga. Avoid exhausting workouts in the heat.',
    protect: [
      { condition: 'High blood pressure', advice: 'Blood pressure often runs lower in summer; if you take BP medicines and feel dizzy, ask your doctor. Drink enough water.', source: 'alperovitch2009' },
      { condition: 'Diabetes', advice: 'Dehydration raises blood sugar and strains the kidneys: sip water through the day and keep checking sugars.' },
      { condition: 'Heat illness', advice: 'Headache, dizziness, confusion or very high temperature need urgent medical care.' },
    ],
    sources: ['ashtanga', 'charaka', 'sushruta', 'hathaYoga', 'alperovitch2009'],
  },
  {
    id: 'varsha',
    name: 'Varsha',
    deva: 'वर्षा',
    english: 'Monsoon',
    months: 'Shravana – Bhadrapada',
    dates: 'about 16 July – 16 September',
    kala: 'Visarga (Dakshinayana)',
    mood: 'Clouds, rain, humid air, damp ground and green everywhere.',
    taste: 'Sour (amla)',
    strength: 'lowest',
    agni: 'Weakest of the year: food must be light, warm and freshly cooked.',
    doshas: {
      vata: 'aggravated',
      pitta: 'builds up',
      kapha: 'steady',
      note: 'Damp, cool winds aggravate Vata; acidic water and weak digestion let Pitta build up. All three doshas are easily disturbed.',
    },
    body: {
      physical: ['Weak digestion: gas, bloating, loose stools', 'Joint stiffness and body aches', 'Infections from water and mosquitoes', 'Fungal skin infections in the damp'],
      mental: ['Dullness and low energy on grey days'],
      emotional: ['Restlessness or low mood for some people'],
    },
    food: {
      favour: ['Light, warm, freshly cooked meals', 'Old rice, wheat, barley, moong dal soup', 'Ginger, black pepper, cumin, rock salt', 'Boiled or filtered water, drunk warm', 'A little honey'],
      avoid: ['Raw salads and street food', 'Leafy greens unless washed and cooked well', 'Curd at night, heavy and fried food', 'Over-eating'],
    },
    routine: ['Keep the body and feet dry', 'Use mosquito nets and repellents', 'Oil massage on dry days', 'Avoid day sleep and getting drenched'],
    yoga: ['Joint-freeing sequence (Pawanmuktasana series)', 'Vajrasana for a few minutes after meals', 'Gentle twists for digestion', 'Moderate, warming flows on cool days'],
    pranayama: ['Nadi Shodhana (alternate-nostril breathing): calms Vata', 'Bhramari (humming bee breath)', 'Gentle Bhastrika on damp, heavy days'],
    exercise: 'Moderate: enough to stay supple, not so much that you are exhausted.',
    protect: [
      { condition: 'Arthritis', advice: 'Many people feel stiffer in the rains, though a large study found no rise in joint-pain visits on rainy days: keep moving gently and keep joints warm.', source: 'jena2017' },
      { condition: 'Fevers and infections', advice: 'Fever in the monsoon can be dengue, malaria or typhoid: see a doctor rather than self-treating.' },
      { condition: 'Diabetes', advice: 'Check your feet every day: damp shoes and small cuts can become infected.' },
      { condition: 'Digestion', advice: 'Eat smaller, warm meals; ginger with a pinch of rock salt before meals can help appetite.' },
    ],
    sources: ['ashtanga', 'charaka', 'sushruta', 'hathaYoga', 'jena2017'],
  },
  {
    id: 'sharad',
    name: 'Sharad',
    deva: 'शरद्',
    english: 'Autumn',
    months: 'Ashvina – Kartika',
    dates: 'about 17 September – 15 November',
    kala: 'Visarga (Dakshinayana)',
    mood: 'Clear blue skies, bright sun, white clouds and moonlit nights.',
    taste: 'Salty (lavana)',
    strength: 'medium',
    agni: 'Recovering, but easily over-heated.',
    doshas: {
      vata: 'settles',
      pitta: 'aggravated',
      kapha: 'steady',
      note: 'After the cool rains, the sudden strong sun heats a body used to cool weather: the Pitta that built up in the monsoon flares.',
    },
    body: {
      physical: ['Acidity and heartburn', 'Skin rashes, acne, prickly heat', 'Eye irritation', 'Fevers'],
      mental: ['Sharp and focused, but easily intense'],
      emotional: ['Impatience, irritability or anger come faster'],
    },
    food: {
      favour: ['Sweet, bitter and astringent tastes', 'Rice, wheat, barley, moong', 'Ghee, milk, amla, pomegranate, grapes', 'Bitter vegetables: bitter gourd, parwal', 'Water warmed by the sun and cooled by the moon (hamsodaka)'],
      avoid: ['Very spicy, sour, salty and fried food', 'Curd, alcohol', 'Too many festival sweets and fried snacks', 'Sitting in the midday sun'],
    },
    routine: ['Sit out in the moonlight in the early evening', 'Wear light, cool colours', 'Sandalwood paste or rose water for hot skin', 'Avoid day sleep'],
    yoga: ['Cooling, moderate practice', 'Forward bends and twists', 'Chandra Namaskar', 'Shavasana and Yoga Nidra to settle intensity'],
    pranayama: ['Sheetali and Sitkari', 'Chandra Bhedana', 'Nadi Shodhana', 'Bhramari for irritability'],
    exercise: 'Moderate: avoid competing and over-heating; prefer mornings and evenings.',
    protect: [
      { condition: 'Acidity and ulcers', advice: 'Eat at regular times, do not skip meals, and cut down spicy, sour and fried food.' },
      { condition: 'High blood pressure', advice: 'Anger and stress raise pressure: slow breathing practices lower it modestly in trials.', source: 'chaddha2019' },
      { condition: 'Diabetes', advice: 'The festival season brings sweets: choose small portions and keep walking after meals.' },
      { condition: 'Skin', advice: 'Rashes that spread, blister or come with fever need a doctor.' },
    ],
    sources: ['ashtanga', 'charaka', 'sushruta', 'hathaYoga', 'gita', 'chaddha2019'],
  },
  {
    id: 'hemanta',
    name: 'Hemanta',
    deva: 'हेमन्त',
    english: 'Early winter',
    months: 'Margashirsha – Pausha',
    dates: 'about 16 November – 13 January',
    kala: 'Visarga (Dakshinayana)',
    mood: 'Cool mornings, misty dawns and dew on the grass.',
    taste: 'Sweet (madhura)',
    strength: 'highest',
    agni: 'Strongest of the year: feed it well, or it starts to burn the body’s own tissues.',
    doshas: {
      vata: 'steady',
      pitta: 'settles',
      kapha: 'steady',
      note: 'Pitta settles in the cool; the body gathers strength. Cold can stir Vata in thin and elderly people, and Kapha begins to gather towards Shishira.',
    },
    body: {
      physical: ['Big appetite and strong digestion', 'Good strength and stamina', 'Dry skin and stiff joints in the cold'],
      mental: ['Steady, calm and focused'],
      emotional: ['Contentment and stability; a good time to build habits'],
    },
    food: {
      favour: ['Nourishing, warm food with sweet, sour and salty tastes', 'New rice, wheat, urad dal, sesame, jaggery', 'Ghee, milk, nuts and dates in sensible amounts', 'Seasonal greens: sarson, methi, bathua', 'Warm water'],
      avoid: ['Cold, light, dry food', 'Skipping meals or long fasts', 'Cold drinks'],
    },
    routine: ['Daily oil massage with sesame oil', 'Morning sun', 'Warm baths and warm clothing', 'Regular sleep; avoid late nights out in the cold'],
    yoga: ['Surya Namaskar', 'Strong standing poses: Virabhadrasana, Utkatasana', 'Inversions if already practised safely, such as Sarvangasana', 'Longer practice: the body has the strength for it'],
    pranayama: ['Bhastrika', 'Kapalabhati', 'Surya Bhedana', 'Ujjayi'],
    exercise: 'Vigorous: the best season to build strength and stamina.',
    protect: [
      { condition: 'High blood pressure', advice: 'Cold raises blood pressure on average: check it more often as it gets colder, and keep warm in the early morning.', source: 'alperovitch2009' },
      { condition: 'Diabetes', advice: 'Winter usually pushes HbA1c up: keep up daily exercise and portion control even when appetite is strong.', source: 'tseng2005' },
      { condition: 'Arthritis', advice: 'Morning stiffness: warm oil, warm water and gentle movement before activity.' },
      { condition: 'Asthma and lung disease', advice: 'Cold air and winter smog can trigger attacks: cover nose and mouth outdoors and follow your inhaler plan.' },
    ],
    sources: ['ashtanga', 'charaka', 'hathaYoga', 'alperovitch2009', 'tseng2005'],
  },
];

/** Every RituId has content; this fails loudly if one is ever missing. */
export function rituById(id: RituId): Ritu {
  const ritu = RITUS.find((r) => r.id === id);
  if (!ritu) throw new Error(`No Ritucharya content for ${id}`);
  return ritu;
}

/** "vata" → "Vata". */
export const capitalize = (word: string) => word.charAt(0).toUpperCase() + word.slice(1);

/** Safety notes shown with every season's breathing practices. */
export const PRANAYAMA_CAUTION =
  'Kapalabhati and Bhastrika are not for people with uncontrolled high blood pressure, heart disease, hernia, epilepsy, recent surgery or pregnancy. Sheetali and Sitkari are best avoided with asthma or a cold. Learn breathing practices from a qualified teacher and stop if you feel dizzy.';

export const MEDICAL_NOTE =
  'For education only, not medical advice. If you have high blood pressure, diabetes, arthritis or any condition, keep taking your medicines and talk to your doctor before changing diet, exercise or treatment.';
