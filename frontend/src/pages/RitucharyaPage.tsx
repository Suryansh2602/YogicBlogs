import { useEffect, useRef, type KeyboardEvent } from 'react';
import { Link, useSearchParams } from 'react-router';
import { RITU_ORDER, rituOn, type RituId } from '../features/ritu/calendar';
import { RituArt } from '../features/ritu/RituArt';
import {
  capitalize,
  MEDICAL_NOTE,
  MEDICAL_NOTE_HI,
  PRANAYAMA_CAUTION,
  RITUS,
  RITUS_HI,
  RITUSANDHI_HI,
  rituById,
  SOURCES,
  type DoshaState,
  type Ritu,
  type SourceId,
} from '../features/ritu/ritucharya';
import { dateIn } from '../features/ritu/sun';
import '../features/ritu/ritu.css';

const isRitu = (v: string | null): v is RituId => RITU_ORDER.some((r) => r.id === v);

const DOSHA_LABEL: Record<DoshaState, string> = {
  'builds up': 'Builds up (chaya)',
  aggravated: 'Aggravated (prakopa)',
  settles: 'Settles (prashama)',
  steady: 'Steady',
};

function SourceMark({ id }: { id: SourceId }) {
  const n = Object.keys(SOURCES).indexOf(id) + 1;
  return (
    <a href={`#source-${id}`} className="source-mark" aria-label={`Source ${String(n)}: ${SOURCES[id].label}`}>
      [{n}]
    </a>
  );
}

function List({ items }: { items: string[] }) {
  return (
    <ul className="ritu-list">
      {items.map((item) => (
        <li key={item}>{item}</li>
      ))}
    </ul>
  );
}

function RituDetail({ ritu }: { ritu: Ritu }) {
  return (
    <div className={`ritu-detail ritu-detail--${ritu.id}`}>
      <header className="ritu-detail__header">
        <RituArt ritu={ritu.id} className="ritu-detail__art" />
        <div className="ritu-detail__heading">
          <h2>
            {ritu.name} <span className="deva">{ritu.deva}</span>
          </h2>
          <p className="ritu-detail__english">
            {ritu.english} · {ritu.months} · {ritu.dates}
          </p>
          <p className="muted">{ritu.mood}</p>
        </div>
      </header>

      <section aria-labelledby={`${ritu.id}-glance`}>
        <h3 id={`${ritu.id}-glance`}>At a glance</h3>
        <dl className="ritu-glance">
          <div>
            <dt>Half of the year</dt>
            <dd>{ritu.kala}</dd>
          </div>
          <div>
            <dt>Body strength (bala)</dt>
            <dd>{capitalize(ritu.strength)}</dd>
          </div>
          <div>
            <dt>Digestion (agni)</dt>
            <dd>{ritu.agni}</dd>
          </div>
          <div>
            <dt>Strongest taste</dt>
            <dd>{ritu.taste}</dd>
          </div>
        </dl>
      </section>

      <section aria-labelledby={`${ritu.id}-doshas`}>
        <h3 id={`${ritu.id}-doshas`}>
          Vata, Pitta and Kapha in {ritu.name} <SourceMark id="sushruta" />
        </h3>
        <ul className="dosha-row">
          {(['vata', 'pitta', 'kapha'] as const).map((d) => (
            <li key={d} className={`dosha dosha--${ritu.doshas[d].replace(' ', '-')}`}>
              <span className="dosha__name">{capitalize(d)}</span>
              <span className="dosha__state">{DOSHA_LABEL[ritu.doshas[d]]}</span>
            </li>
          ))}
        </ul>
        <p>{ritu.doshas.note}</p>
      </section>

      <section aria-labelledby={`${ritu.id}-body`}>
        <h3 id={`${ritu.id}-body`}>How body and mind feel</h3>
        <div className="ritu-columns">
          <div>
            <h4>Physically</h4>
            <List items={ritu.body.physical} />
          </div>
          <div>
            <h4>Mentally</h4>
            <List items={ritu.body.mental} />
          </div>
          <div>
            <h4>Emotionally</h4>
            <List items={ritu.body.emotional} />
          </div>
        </div>
      </section>

      <section aria-labelledby={`${ritu.id}-food`}>
        <h3 id={`${ritu.id}-food`}>
          What to eat <SourceMark id="ashtanga" />
        </h3>
        <div className="ritu-columns ritu-columns--two">
          <div className="ritu-box ritu-box--yes">
            <h4>Favour</h4>
            <List items={ritu.food.favour} />
          </div>
          <div className="ritu-box ritu-box--no">
            <h4>Reduce or avoid</h4>
            <List items={ritu.food.avoid} />
          </div>
        </div>
      </section>

      <section aria-labelledby={`${ritu.id}-routine`}>
        <h3 id={`${ritu.id}-routine`}>Daily routine</h3>
        <List items={ritu.routine} />
      </section>

      <section aria-labelledby={`${ritu.id}-practice`}>
        <h3 id={`${ritu.id}-practice`}>
          Yoga, breathing and exercise <SourceMark id="hathaYoga" />
        </h3>
        <div className="ritu-columns ritu-columns--two">
          <div>
            <h4>Asanas</h4>
            <List items={ritu.yoga} />
          </div>
          <div>
            <h4>Pranayama</h4>
            <List items={ritu.pranayama} />
          </div>
        </div>
        <p>
          <strong>Exercise:</strong> {ritu.exercise}
        </p>
        <p className="ritu-caution" role="note">
          <strong>Breathing safely:</strong> {PRANAYAMA_CAUTION}
        </p>
      </section>

      <section aria-labelledby={`${ritu.id}-protect`}>
        <h3 id={`${ritu.id}-protect`}>Protecting your health this season</h3>
        <ul className="protect-list">
          {ritu.protect.map((p) => (
            <li key={p.condition}>
              <strong>{p.condition}.</strong> {p.advice} {p.source && <SourceMark id={p.source} />}
            </li>
          ))}
        </ul>
      </section>

      <p className="ritu-sources-inline muted">
        Sources for {ritu.name}:{' '}
        {ritu.sources.map((s, i) => (
          <span key={s}>
            {i > 0 && ', '}
            <a href={`#source-${s}`}>{SOURCES[s].label.split('.')[0]}</a>
          </span>
        ))}
      </p>
    </div>
  );
}

/** The owner's Hindi guide for one ritu. */
function RituDetailHindi({ ritu }: { ritu: Ritu }) {
  const hi = RITUS_HI[ritu.id];
  return (
    <div className={`ritu-detail ritu-detail--${ritu.id}`} lang="hi">
      <header className="ritu-detail__header">
        <RituArt ritu={ritu.id} className="ritu-detail__art" />
        <div className="ritu-detail__heading">
          <h2>{hi.name}</h2>
          <p className="ritu-detail__english">
            {hi.english} · {hi.samay}
          </p>
          <p>{hi.intro}</p>
        </div>
      </header>
      <div className="ritu-columns ritu-columns--two">
        <section className="ritu-box ritu-box--yes" aria-labelledby={`${ritu.id}-hi-eat`}>
          <h3 id={`${ritu.id}-hi-eat`}>क्या खाएं?</h3>
          <List items={hi.eat} />
        </section>
        <section aria-labelledby={`${ritu.id}-hi-life`}>
          <h3 id={`${ritu.id}-hi-life`}>लाइफस्टाइल</h3>
          <List items={hi.lifestyle} />
        </section>
      </div>
      <section className="ritu-box ritu-box--no" aria-labelledby={`${ritu.id}-hi-avoid`}>
        <h3 id={`${ritu.id}-hi-avoid`}>क्या न करें</h3>
        <p>{hi.avoid}</p>
      </section>
    </div>
  );
}

export default function RitucharyaPage() {
  const [params, setParams] = useSearchParams();
  const today = dateIn('Asia/Kolkata');
  const current = rituOn(today.month, today.day);
  const requested = params.get('ritu');
  const selected: RituId = isRitu(requested) ? requested : current;
  const hindi = params.get('lang') === 'hi';
  const tabRefs = useRef<Partial<Record<RituId, HTMLButtonElement | null>>>({});

  useEffect(() => {
    document.title = 'Ritucharya: living by the six seasons · Healthmarg';
  }, []);

  const select = (id: RituId, focus = false) => {
    setParams(hindi ? { ritu: id, lang: 'hi' } : { ritu: id }, { replace: true, preventScrollReset: true });
    if (focus) tabRefs.current[id]?.focus();
  };

  // Arrow keys move between season tabs (WAI-ARIA tabs pattern).
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const index = RITUS.findIndex((r) => r.id === selected);
    const moves: Record<string, number> = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 };
    let next: number | undefined;
    if (event.key in moves) next = (index + (moves[event.key] ?? 0) + RITUS.length) % RITUS.length;
    if (event.key === 'Home') next = 0;
    if (event.key === 'End') next = RITUS.length - 1;
    const target = next === undefined ? undefined : RITUS[next];
    if (target) {
      event.preventDefault();
      select(target.id, true);
    }
  };

  const ritu = rituById(selected);
  return (
    <div className="ritucharya">
      <section className="container ritucharya__intro">
        <p className="eyebrow">
          <span className="deva dandas">ऋतुचर्या</span> Ritucharya
        </p>
        <h1>
          Living in tune with the six seasons
        </h1>
        <p className="ritucharya__lead">
          Ayurveda divides the year into six ritus of about two months each. As the sun, heat, rain and cold change, so do our digestion, strength and the balance of Vata, Pitta
          and Kapha. <strong>Ritucharya</strong> is the regimen for each season: what to eat, how to move and breathe, and how to protect your health before problems begin.{' '}
          <SourceMark id="charaka" /> <SourceMark id="thakkar2011" />
        </p>
        <div className="ritucharya__halves">
          <p>
            <strong>Adana kala</strong> (Shishira, Vasanta, Grishma): the sun grows strong and “takes” moisture and strength from the body.
          </p>
          <p>
            <strong>Visarga kala</strong> (Varsha, Sharad, Hemanta): the moon and rains “give” back, and strength returns.
          </p>
          <p>
            <strong>Ritusandhi</strong>: the last week of one ritu and the first of the next. Change habits gradually, not overnight. <SourceMark id="ashtanga" />
          </p>
        </div>
        <div className="ritucharya__bar">
          <p className="ritucharya__now">
            Now: <strong>{rituById(current).name}</strong> ({rituById(current).english}). Choose any season below.
          </p>
          <div className="segmented" role="group" aria-label="Language / भाषा">
            <button
              type="button"
              className="segmented__option"
              aria-pressed={!hindi}
              onClick={() => {
                setParams({ ritu: selected }, { replace: true, preventScrollReset: true });
              }}
            >
              English
            </button>
            <button
              type="button"
              className="segmented__option"
              lang="hi"
              aria-pressed={hindi}
              onClick={() => {
                setParams({ ritu: selected, lang: 'hi' }, { replace: true, preventScrollReset: true });
              }}
            >
              हिन्दी
            </button>
          </div>
        </div>
        {hindi && (
          <p className="ritucharya__sandhi-hi" lang="hi">
            <strong>💡 ऋतु संधि (सुनहरा नियम):</strong> {RITUSANDHI_HI}
          </p>
        )}
      </section>

      <section className="container" aria-label="The six seasons">
        <div className="ritu-tabs" role="tablist" aria-label="Seasons" onKeyDown={onKeyDown}>
          {RITUS.map((r) => {
            const active = r.id === selected;
            return (
              <button
                key={r.id}
                ref={(el) => {
                  tabRefs.current[r.id] = el;
                }}
                type="button"
                role="tab"
                id={`tab-${r.id}`}
                aria-selected={active}
                aria-controls={`panel-${r.id}`}
                tabIndex={active ? 0 : -1}
                className={`ritu-tab ritu-tab--${r.id} ${active ? 'ritu-tab--active' : ''}`}
                onClick={() => {
                  select(r.id);
                }}
              >
                <RituArt ritu={r.id} className="ritu-tab__art" />
                <span className="ritu-tab__text">
                  <span className="ritu-tab__name">
                    {hindi ? RITUS_HI[r.id].name : r.name} {!hindi && <span className="deva">{r.deva}</span>}
                  </span>
                  <span className="ritu-tab__english">{hindi ? RITUS_HI[r.id].english : r.english}</span>
                  {r.id === current && <span className="badge badge--accent ritu-tab__now">Now</span>}
                </span>
              </button>
            );
          })}
        </div>
        <div role="tabpanel" id={`panel-${ritu.id}`} aria-labelledby={`tab-${ritu.id}`} tabIndex={0} className="ritu-panel">
          {hindi ? <RituDetailHindi ritu={ritu} /> : <RituDetail ritu={ritu} />}
        </div>
      </section>

      <section className="container ritu-year" aria-labelledby="year-title">
        <h2 id="year-title">The doshas through the year</h2>
        <div className="table-scroll">
          <table className="ritu-table">
            <caption className="visually-hidden">How Vata, Pitta and Kapha change across the six seasons</caption>
            <thead>
              <tr>
                <th scope="col">Dosha</th>
                {RITUS.map((r) => (
                  <th scope="col" key={r.id}>
                    {r.name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(['vata', 'pitta', 'kapha'] as const).map((d) => (
                <tr key={d}>
                  <th scope="row">{capitalize(d)}</th>
                  {RITUS.map((r) => (
                    <td key={r.id} className={`dosha--${r.doshas[d].replace(' ', '-')}`}>
                      {DOSHA_LABEL[r.doshas[d]]}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="ritu-principles">
          <blockquote>
            <p className="deva">स्थिरसुखमासनम्</p>
            <p>
              A posture should be steady and easy. (Yoga Sutra 2.46) Choose practices your body can hold calmly in each season. <SourceMark id="yogaSutra" />
            </p>
          </blockquote>
          <blockquote>
            <p className="deva">युक्ताहारविहारस्य</p>
            <p>
              Yoga is for one who is moderate in eating, activity and sleep. (Bhagavad Gita 6.17) Ritucharya is moderation, adjusted to the season. <SourceMark id="gita" />
            </p>
          </blockquote>
        </div>
      </section>

      <section className="container ritu-references" aria-labelledby="refs-title">
        <h2 id="refs-title">Sources</h2>
        <ol>
          {(Object.keys(SOURCES) as SourceId[]).map((id) => (
            <li key={id} id={`source-${id}`}>
              {SOURCES[id].href ? (
                <a href={SOURCES[id].href} target="_blank" rel="noopener noreferrer">
                  {SOURCES[id].label}
                </a>
              ) : (
                <strong>{SOURCES[id].label}</strong>
              )}{' '}
              {SOURCES[id].detail}
            </li>
          ))}
        </ol>
        <p className="ritu-medical" role="note">
          {MEDICAL_NOTE}
        </p>
        {hindi && (
          <p className="ritu-medical" role="note" lang="hi">
            {MEDICAL_NOTE_HI}
          </p>
        )}
        <p>
          <Link to="/">← Back home</Link>
        </p>
      </section>
    </div>
  );
}
