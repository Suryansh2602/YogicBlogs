// Ritu calendar and sunrise/sunset maths.
import { describe, expect, it } from 'vitest';
import { rituOn, sandhiOn } from '../../src/features/ritu/calendar';
import { dateIn, formatTime, NEW_DELHI, sunTimes } from '../../src/features/ritu/sun';

describe('ritu calendar', () => {
  it.each([
    [1, 1, 'hemanta'],
    [1, 14, 'shishira'],
    [3, 14, 'shishira'],
    [3, 15, 'vasanta'],
    [5, 20, 'grishma'],
    [8, 1, 'varsha'],
    [10, 28, 'sharad'],
    [11, 16, 'hemanta'],
    [12, 31, 'hemanta'],
  ] as const)('%i/%i is %s', (month, day, ritu) => {
    expect(rituOn(month, day)).toBe(ritu);
  });

  it('marks Ritusandhi: 7 days either side of a change, across the new year too', () => {
    expect(sandhiOn(9, 20)).toEqual({ from: 'varsha', to: 'sharad' });
    expect(sandhiOn(9, 11)).toEqual({ from: 'varsha', to: 'sharad' });
    expect(sandhiOn(10, 28)).toBeNull();
    expect(sandhiOn(1, 10)).toEqual({ from: 'hemanta', to: 'shishira' });
    expect(sandhiOn(1, 16)).toEqual({ from: 'hemanta', to: 'shishira' });
  });
});

describe('sunrise and sunset', () => {
  const minutes = (d: Date | null) => (d ? d.getUTCHours() * 60 + d.getUTCMinutes() : NaN);

  it('matches published times for London at midsummer (within 2 minutes)', () => {
    const { sunrise, sunset } = sunTimes(2024, 6, 21, { latitude: 51.5074, longitude: -0.1278 });
    // 04:43 and 21:21 British Summer Time = 03:43 and 20:21 UTC.
    expect(Math.abs(minutes(sunrise) - (3 * 60 + 43))).toBeLessThanOrEqual(2);
    expect(Math.abs(minutes(sunset) - (20 * 60 + 21))).toBeLessThanOrEqual(2);
  });

  it('gives New Delhi a plausible day: sunrise near 6:30, sunset near 17:40 IST in late October', () => {
    const { sunrise, sunset } = sunTimes(2026, 10, 28, NEW_DELHI);
    const rise = formatTime(sunrise, 'Asia/Kolkata');
    const set = formatTime(sunset, 'Asia/Kolkata');
    expect(rise).toMatch(/^6:(2|3)\d\s?am$/i);
    expect(set).toMatch(/^5:(3|4)\d\s?pm$/i);
  });

  it('knows the sun does not rise in Tromsø at midwinter', () => {
    expect(sunTimes(2024, 12, 21, { latitude: 69.6492, longitude: 18.9553 })).toEqual({ sunrise: null, sunset: null });
    expect(formatTime(null, 'Asia/Kolkata')).toBe('—');
  });

  it('reads the calendar date in a time zone', () => {
    // 20:00 UTC on 28 Oct is already 29 Oct in India.
    expect(dateIn('Asia/Kolkata', new Date('2026-10-28T20:00:00Z'))).toEqual({ year: 2026, month: 10, day: 29 });
  });
});
