// Sunrise and sunset, worked out in the browser with the standard "sunrise equation" (accurate to about a
// minute away from the poles). No outside service: nothing about the visitor's location leaves the page.

const RAD = Math.PI / 180;
const DAY_MS = 86_400_000;
const J1970 = 2440587.5; // Julian day of 1970-01-01T00:00Z
const J2000 = 2451545.0;

export interface Place {
  name: string;
  latitude: number;
  longitude: number; // east positive
  timeZone: string;
}

/** Default place when the visitor hasn't shared theirs. */
export const NEW_DELHI: Place = { name: 'New Delhi', latitude: 28.6139, longitude: 77.209, timeZone: 'Asia/Kolkata' };

export interface SunTimes {
  sunrise: Date | null; // null: the sun doesn't rise that day (polar night)
  sunset: Date | null; // null: it doesn't set (midnight sun)
}

const fromJulian = (j: number) => new Date((j - J1970) * DAY_MS);

/** Sunrise and sunset on a calendar day (year, month 1–12, day) at a place. */
export function sunTimes(year: number, month: number, day: number, place: Pick<Place, 'latitude' | 'longitude'>): SunTimes {
  const jdMidnight = Date.UTC(year, month - 1, day) / DAY_MS + J1970;
  const n = Math.ceil(jdMidnight - J2000 + 0.0008);
  const meanSolarTime = n - place.longitude / 360;
  const meanAnomaly = (357.5291 + 0.98560028 * meanSolarTime) % 360;
  const m = meanAnomaly * RAD;
  const center = 1.9148 * Math.sin(m) + 0.02 * Math.sin(2 * m) + 0.0003 * Math.sin(3 * m);
  const eclipticLongitude = ((meanAnomaly + center + 180 + 102.9372) % 360) * RAD;
  const transit = J2000 + meanSolarTime + 0.0053 * Math.sin(m) - 0.0069 * Math.sin(2 * eclipticLongitude);
  const declination = Math.asin(Math.sin(eclipticLongitude) * Math.sin(23.4397 * RAD));
  const lat = place.latitude * RAD;
  // -0.833°: the sun's upper edge on the horizon, allowing for refraction.
  const cosHourAngle = (Math.sin(-0.833 * RAD) - Math.sin(lat) * Math.sin(declination)) / (Math.cos(lat) * Math.cos(declination));
  if (cosHourAngle > 1) return { sunrise: null, sunset: null };
  if (cosHourAngle < -1) return { sunrise: null, sunset: null };
  const hourAngle = Math.acos(cosHourAngle) / (2 * Math.PI);
  return { sunrise: fromJulian(transit - hourAngle), sunset: fromJulian(transit + hourAngle) };
}

/** The calendar date (year, month, day) right now in a time zone. */
export function dateIn(timeZone: string, now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  return { year: get('year'), month: get('month'), day: get('day') };
}

export const formatTime = (date: Date | null, timeZone: string) =>
  date ? date.toLocaleTimeString('en-IN', { timeZone, hour: 'numeric', minute: '2-digit' }) : '—';
