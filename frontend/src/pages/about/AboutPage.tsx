import { Link, useSearchParams } from 'react-router';
import { ContactLinks } from '../../components/ContactLinks';
import { BUSINESS } from '../../config/business';
import { MEDICAL_NOTE, MEDICAL_NOTE_HI } from '../../features/ritu/ritucharya';
import { useHydrated } from '../../prerender/hydration';
import { aboutSeo } from '../../seo/aboutSeo';
import { useSeo } from '../../seo/useSeo';
import { ABOUT_EN, ABOUT_HI } from './aboutContent';
import '../pages.css';
import './about.css';

/** Who Healthmarg is, where its guidance comes from, and how to reach us. English, or Hindi with ?lang=hi. */
export default function AboutPage() {
  const [params, setParams] = useSearchParams();
  // The prerendered page is the English one; Hindi follows straight after hydration (docs/page-speed.md).
  const hydrated = useHydrated();
  const hindi = hydrated && params.get('lang') === 'hi';
  const t = hindi ? ABOUT_HI : ABOUT_EN;
  useSeo(aboutSeo(hindi));

  return (
    <div className="about" lang={hindi ? 'hi' : undefined}>
      <section className="container about__intro">
        <p className="eyebrow">
          <span className="deva dandas">स्वास्थ्य मार्ग</span> {t.eyebrow}
        </p>
        <h1>{t.title}</h1>
        <p className="about__lead">{t.lead}</p>
        {t.intro.map((p) => (
          <p key={p}>{p}</p>
        ))}
        <div className="segmented" role="group" aria-label="Language / भाषा">
          <button
            type="button"
            className="segmented__option"
            aria-pressed={!hindi}
            onClick={() => {
              setParams({}, { replace: true, preventScrollReset: true });
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
              setParams({ lang: 'hi' }, { replace: true, preventScrollReset: true });
            }}
          >
            हिन्दी
          </button>
        </div>
      </section>

      <section className="container about__section" aria-labelledby="about-sources">
        <header className="home-section__head">
          <h2 id="about-sources">{t.sourcesTitle}</h2>
        </header>
        <p className="about__section-lead">{t.sourcesIntro}</p>
        <dl className="about__sources">
          {t.sources.map((s) => (
            <div key={s.group} className="about__source">
              <dt>{s.group}</dt>
              <dd>
                <strong>{s.texts}</strong>
                <span>{s.teaches}</span>
              </dd>
            </div>
          ))}
        </dl>
      </section>

      <section className="container about__section" aria-labelledby="about-do">
        <header className="home-section__head">
          <h2 id="about-do">{t.doTitle}</h2>
        </header>
        <ul className="pillars">
          {t.does.map((d) => (
            <li key={d.title} className="pillar">
              <h3>{d.title}</h3>
              <p className="muted">{d.text}</p>
              {d.link && (
                <Link to={d.link.to} className="pillar__link">
                  {d.link.label} <span aria-hidden="true">→</span>
                </Link>
              )}
            </li>
          ))}
        </ul>
      </section>

      <section className="container about__section" aria-labelledby="about-why">
        <header className="home-section__head">
          <h2 id="about-why">{t.whyTitle}</h2>
        </header>
        <ul className="pillars">
          {t.why.map((w) => (
            <li key={w.title} className="pillar">
              <h3>{w.title}</h3>
              <p className="muted">{w.text}</p>
            </li>
          ))}
        </ul>
        <p className="about__closing">{t.whyClosing}</p>
      </section>

      <section className="container about__section about__who" aria-labelledby="about-who">
        <div>
          <header className="home-section__head">
            <h2 id="about-who">{t.whoTitle}</h2>
          </header>
          <p>{t.who}</p>
          <dl className="about__facts">
            <div>
              <dt>{t.labels.tradeName}</dt>
              <dd>{BUSINESS.tradeName}</dd>
            </div>
            <div>
              <dt>{t.labels.proprietor}</dt>
              <dd>{t.proprietor}</dd>
            </div>
            <div>
              <dt>{t.labels.place}</dt>
              <dd>{t.place}</dd>
            </div>
            <div>
              <dt>{t.labels.gstin}</dt>
              <dd>{BUSINESS.gstin}</dd>
            </div>
            <div>
              <dt>{t.labels.fssai}</dt>
              <dd>{BUSINESS.fssai.number ?? t.fssaiApplied(BUSINESS.fssai.applicationRef)}</dd>
            </div>
          </dl>
        </div>
        <div className="about__contact" aria-labelledby="about-contact" role="group">
          <header className="home-section__head">
            <h2 id="about-contact">{t.contactTitle}</h2>
          </header>
          <p>{t.contactText}</p>
          <ContactLinks whatsappLabel={t.whatsapp} callLabel={t.call} />
        </div>
      </section>

      <section className="container about__section">
        <p className="about__medical" role="note">
          {hindi ? MEDICAL_NOTE_HI : MEDICAL_NOTE}
        </p>
      </section>
    </div>
  );
}
