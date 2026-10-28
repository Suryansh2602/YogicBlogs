// The six ritus (Indian seasons) of Ayurveda, each two solar months long, following the Sun's passage
// through the sidereal signs (Sankranti dates). Ashtanga Hridaya, Sutrasthana 3: Shishira, Vasanta and
// Grishma make Adana kala (the "taking" half, Uttarayana); Varsha, Sharad and Hemanta make Visarga kala
// (the "giving" half, Dakshinayana). Sankranti dates drift by a day between years; these are typical.

export type RituId = 'shishira' | 'vasanta' | 'grishma' | 'varsha' | 'sharad' | 'hemanta';

export interface RituWindow {
  id: RituId;
  /** First day (month 1–12, day) of the ritu: the Sankranti that opens it. */
  start: { month: number; day: number };
}

// In calendar order through the year, starting with Makara Sankranti.
export const RITU_ORDER: readonly RituWindow[] = [
  { id: 'shishira', start: { month: 1, day: 14 } }, // Makara Sankranti
  { id: 'vasanta', start: { month: 3, day: 15 } }, // Meena Sankranti
  { id: 'grishma', start: { month: 5, day: 15 } }, // Vrishabha Sankranti
  { id: 'varsha', start: { month: 7, day: 16 } }, // Karka Sankranti
  { id: 'sharad', start: { month: 9, day: 17 } }, // Kanya Sankranti
  { id: 'hemanta', start: { month: 11, day: 16 } }, // Vrishchika Sankranti
];

const dayOfYear = (month: number, day: number) => Math.round((Date.UTC(2001, month - 1, day) - Date.UTC(2001, 0, 1)) / 86_400_000);

/** The ritu on a calendar day (month 1–12). */
export function rituOn(month: number, day: number): RituId {
  const today = dayOfYear(month, day);
  let current: RituId = 'hemanta'; // 1–13 January is still Hemanta
  for (const r of RITU_ORDER) if (today >= dayOfYear(r.start.month, r.start.day)) current = r.id;
  return current;
}

export interface Sandhi {
  /** The ritu that is ending and the one that is beginning. */
  from: RituId;
  to: RituId;
}

/**
 * Ritusandhi: the last 7 days of a ritu and the first 7 of the next, when Ayurveda advises changing habits
 * gradually (Ashtanga Hridaya, Sutrasthana 3). null outside those 14 days.
 */
export function sandhiOn(month: number, day: number): Sandhi | null {
  const today = dayOfYear(month, day);
  for (let i = 0; i < RITU_ORDER.length; i += 1) {
    const r = RITU_ORDER[i];
    if (!r) continue;
    const change = dayOfYear(r.start.month, r.start.day);
    // Distance in days on a circular year.
    const diff = ((today - change + 365) % 365 + 365) % 365;
    const before = 365 - diff;
    if (diff < 7 || before <= 7) {
      const previous = RITU_ORDER[(i + RITU_ORDER.length - 1) % RITU_ORDER.length];
      if (previous) return { from: previous.id, to: r.id };
    }
  }
  return null;
}
