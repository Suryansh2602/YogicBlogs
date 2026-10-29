// The season strip under the header on every page: today's date, the current ritu (and Ritusandhi when
// seasons are changing), sunrise and sunset, moving slowly like a marquee. Its colour follows the ritu.
// It pauses on hover, on keyboard focus and with its Pause button, and stands still for visitors who
// prefer reduced motion. Location: New Delhi until the visitor chooses "Use my location" (the browser asks
// them then, never on page load); their place is remembered only in this browser.
import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { rituOn, sandhiOn } from './calendar';
import { RituArt } from './RituArt';
import { RITU_NAMES } from './names';
import { dateIn, formatTime, NEW_DELHI, sunTimes, type Place } from './sun';
import './seasonStrip.css';

const PLACE_KEY = 'hm-place';

function savedPlace(): Place {
  try {
    const raw = localStorage.getItem(PLACE_KEY);
    if (!raw) return NEW_DELHI;
    const p = JSON.parse(raw) as Partial<Place>;
    if (typeof p.latitude === 'number' && typeof p.longitude === 'number' && typeof p.timeZone === 'string' && typeof p.name === 'string') {
      return p as Place;
    }
  } catch {
    // Storage blocked or the value is damaged: fall back to the default.
  }
  return NEW_DELHI;
}

export function SeasonStrip() {
  const [now, setNow] = useState(() => new Date());
  const [place, setPlace] = useState<Place>(savedPlace);
  const [locating, setLocating] = useState(false);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [paused, setPaused] = useState(false);

  // Refresh once a minute so the date and times are right if the page stays open past midnight.
  useEffect(() => {
    const timer = setInterval(() => {
      setNow(new Date());
    }, 60_000);
    return () => {
      clearInterval(timer);
    };
  }, []);

  const { year, month, day } = dateIn(place.timeZone, now);
  const rituId = rituOn(month, day);
  const ritu = RITU_NAMES[rituId];
  const sandhi = sandhiOn(month, day);
  const sun = sunTimes(year, month, day, place);
  const dateText = now.toLocaleDateString('en-IN', { timeZone: place.timeZone, weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

  const useMyLocation = () => {
    if (!('geolocation' in navigator)) {
      setLocationError('This browser can’t share a location. Showing New Delhi.');
      return;
    }
    setLocating(true);
    setLocationError(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const next: Place = {
          name: 'Your location',
          latitude: Math.round(pos.coords.latitude * 100) / 100, // ~1 km is plenty for sunrise times
          longitude: Math.round(pos.coords.longitude * 100) / 100,
          timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        };
        setPlace(next);
        setLocating(false);
        try {
          localStorage.setItem(PLACE_KEY, JSON.stringify(next));
        } catch {
          // Not remembered next time; still used now.
        }
      },
      (err) => {
        setLocating(false);
        setLocationError(
          err.code === err.PERMISSION_DENIED
            ? 'Location wasn’t shared, so times are for New Delhi. You can allow it in your browser’s site settings.'
            : 'Couldn’t find your location right now. Showing New Delhi.',
        );
      },
      { maximumAge: 3_600_000, timeout: 10_000 },
    );
  };

  const useDelhi = () => {
    setPlace(NEW_DELHI);
    setLocationError(null);
    try {
      localStorage.removeItem(PLACE_KEY);
    } catch {
      // Nothing stored.
    }
  };

  /**
   * One run of the strip's content. The marquee shows it twice for a seamless loop; the copy can be clicked
   * but is skipped by the keyboard and screen readers, so nothing is read or focused twice.
   */
  const items = (copy: boolean) => (
    <ul className="season-strip__items" aria-hidden={copy || undefined}>
      <li>{dateText}</li>
      <li>
        Season: <strong>{ritu.name}</strong> <span className="deva">{ritu.deva}</span> · {ritu.english}
      </li>
      {sandhi && (
        <li>
          Ritusandhi: {RITU_NAMES[sandhi.from].name} is giving way to {RITU_NAMES[sandhi.to].name}. Change food and habits gradually.
        </li>
      )}
      <li>
        Sunrise <strong>{formatTime(sun.sunrise, place.timeZone)}</strong>
      </li>
      <li>
        Sunset <strong>{formatTime(sun.sunset, place.timeZone)}</strong>
      </li>
      <li>
        {place.name}{' '}
        {place.name === NEW_DELHI.name ? (
          <button type="button" className="season-strip__action" tabIndex={copy ? -1 : undefined} onClick={useMyLocation} disabled={locating}>
            {locating ? 'Finding you…' : 'Use my location'}
          </button>
        ) : (
          <button type="button" className="season-strip__action" tabIndex={copy ? -1 : undefined} onClick={useDelhi}>
            Use New Delhi
          </button>
        )}
      </li>
      <li>
        <Link to={`/ritucharya?ritu=${rituId}`} className="season-strip__action" tabIndex={copy ? -1 : undefined}>
          Living well in {ritu.name} →
        </Link>
      </li>
    </ul>
  );

  return (
    <section className={`season-strip season-strip--${rituId}`} aria-label={`Today: ${ritu.name}, ${ritu.english}`}>
      <div className="container season-strip__inner">
        <Link to={`/ritucharya?ritu=${rituId}`} className="season-strip__badge" aria-label={`${ritu.name}: living well this season`}>
          <RituArt ritu={rituId} className="season-strip__art" />
          <span className="season-strip__name">{ritu.name}</span>
        </Link>
        <div className={`season-strip__window ${paused ? 'season-strip__window--paused' : ''}`}>
          <div className="season-strip__track">
            {items(false)}
            {items(true)}
          </div>
        </div>
        <button
          type="button"
          className="season-strip__pause"
          aria-pressed={paused}
          onClick={() => {
            setPaused((p) => !p);
          }}
        >
          <span aria-hidden="true">{paused ? '▶' : '❚❚'}</span>
          <span className="visually-hidden">{paused ? 'Play the season strip' : 'Pause the season strip'}</span>
        </button>
      </div>
      {locationError && (
        <p className="container season-strip__error" role="status">
          {locationError}
        </p>
      )}
    </section>
  );
}
