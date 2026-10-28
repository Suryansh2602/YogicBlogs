// "Today" on the home page: the date, the current ritu (and Ritusandhi when seasons are changing), and
// sunrise/sunset. Location: New Delhi until the visitor chooses "Use my location" (the browser asks them
// then, never on page load). Their place is remembered only in this browser.
import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { rituOn, sandhiOn } from './calendar';
import { RituArt } from './RituArt';
import { RITU_NAMES } from './names';
import { dateIn, formatTime, NEW_DELHI, sunTimes, type Place } from './sun';
import './ritu.css';

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

export function TodayPanel() {
  const [now, setNow] = useState(() => new Date());
  const [place, setPlace] = useState<Place>(savedPlace);
  const [locating, setLocating] = useState(false);
  const [locationError, setLocationError] = useState<string | null>(null);

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
  const ritu = { id: rituId, ...RITU_NAMES[rituId] };
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

  return (
    <aside className="today" aria-labelledby="today-title">
      <h2 id="today-title" className="today__title">
        Today <span className="deva today__deva">आज</span>
      </h2>
      <p className="today__date">{dateText}</p>

      <Link to={`/ritucharya?ritu=${ritu.id}`} className={`today__ritu today__ritu--${ritu.id}`}>
        <RituArt ritu={ritu.id} className="today__art" />
        <span className="today__ritu-text">
          <span className="today__label">Season (ritu)</span>
          <span className="today__ritu-name">
            {ritu.name} <span className="deva">{ritu.deva}</span>
          </span>
          <span className="muted today__ritu-en">{ritu.english}</span>
        </span>
      </Link>
      {sandhi && (
        <p className="today__sandhi">
          <strong>Ritusandhi:</strong> {RITU_NAMES[sandhi.from].name} is giving way to {RITU_NAMES[sandhi.to].name}. Change food and habits gradually.
        </p>
      )}

      <dl className="today__sun">
        <div>
          <dt>
            <span aria-hidden="true">🌅</span> Sunrise
          </dt>
          <dd>{formatTime(sun.sunrise, place.timeZone)}</dd>
        </div>
        <div>
          <dt>
            <span aria-hidden="true">🌇</span> Sunset
          </dt>
          <dd>{formatTime(sun.sunset, place.timeZone)}</dd>
        </div>
      </dl>
      <p className="today__place muted">
        For {place.name}
        {place.name === NEW_DELHI.name ? (
          <button type="button" className="link-button" onClick={useMyLocation} disabled={locating}>
            {locating ? 'Finding you…' : 'Use my location'}
          </button>
        ) : (
          <button type="button" className="link-button" onClick={useDelhi}>
            Use New Delhi
          </button>
        )}
      </p>
      {locationError && (
        <p className="today__error" role="status">
          {locationError}
        </p>
      )}
      <Link to={`/ritucharya?ritu=${ritu.id}`} className="today__more">
        Living well in {ritu.name} →
      </Link>
    </aside>
  );
}
