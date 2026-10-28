import type { CSSProperties } from 'react';
import { Link } from 'react-router';
import { LogoMark } from '../components/brand/Logo';
import { Mandala } from '../components/brand/Mandala';
import { Nakshatra } from '../components/brand/Nakshatra';
import { Yantra } from '../components/brand/Yantra';
import { Aurora } from '../components/motion/Aurora';
import { BlurReveal } from '../components/motion/BlurReveal';
import { ShinyText } from '../components/motion/ShinyText';
import { SpotlightCard } from '../components/motion/SpotlightCard';
import { useAuth } from '../features/auth/useAuth';
import './pages.css';

const PILLARS = [
  {
    deva: 'निदान',
    title: 'Understand the root',
    text: 'Clear explanations of what causes common conditions, from the body and from daily habits.',
  },
  {
    deva: 'चिकित्सा',
    title: 'Ayurvedic ways to heal',
    text: 'Gentle remedies, diet and routines drawn from Ayurveda and written with yoga practitioners.',
  },
  {
    deva: 'श्रवण',
    title: 'Read or listen',
    text: 'Every article is made to be read at your pace or heard on a walk, with your place remembered.',
  },
];

export default function HomePage() {
  const { user } = useAuth();
  return (
    <>
      <section className="hero">
        <Aurora />
        <Nakshatra />
        <Mandala size={720} className="hero__mandala" />
        <div className="container hero__inner">
          <div className="hero__emblem">
            <Yantra size={190} className="hero__yantra" />
            <LogoMark size={88} animated className="hero__mark" />
          </div>
          <p className="eyebrow rise-in" style={{ '--delay': '150ms' } as CSSProperties}>
            <span className="deva dandas">स्वास्थ्य मार्ग</span> The path to wellbeing
          </p>
          <h1 className="hero__title">
            <BlurReveal text="Ancient wisdom for" delay={250} />{' '}
            {/* The sheen paints text through background-clip, which a per-word blur would break: this phrase rises instead. */}
            <ShinyText className="hero__shine rise-in" style={{ '--delay': '550ms' } as CSSProperties}>
              modern ease
            </ShinyText>
          </h1>
          <p className="hero__lead rise-in" style={{ '--delay': '700ms' } as CSSProperties}>
            Understand the causes of everyday conditions and find Ayurvedic ways to heal, guided by yoga practitioners.
          </p>
          <div className="hero__actions rise-in" style={{ '--delay': '850ms' } as CSSProperties}>
            {user ? (
              <Link to={user.role === 'admin' ? '/admin' : '/dashboard'} className="btn btn--primary btn--lg">
                <span className="btn__label">Continue your path</span>
                <span className="btn__arrow" aria-hidden="true">
                  →
                </span>
              </Link>
            ) : (
              <>
                <Link to="/signup" className="btn btn--primary btn--lg">
                  <span className="btn__label">Begin free</span>
                  <span className="btn__arrow" aria-hidden="true">
                    →
                  </span>
                </Link>
                <Link to="/signin" className="btn btn--secondary btn--lg">
                  <span className="btn__label">Sign in</span>
                </Link>
              </>
            )}
          </div>
          <p className="hero__tagline rise-in" style={{ '--delay': '1000ms' } as CSSProperties}>
            Break limits. Find ease.
          </p>
        </div>
      </section>

      <section className="container pillars" aria-labelledby="pillars-title">
        <h2 id="pillars-title" className="section-title">
          <BlurReveal text="Three steps on the path" />
        </h2>
        <div className="pillars__grid">
          {PILLARS.map((p, i) => (
            <SpotlightCard key={p.title} className="pillar rise-in">
              <span className="pillar__num" aria-hidden="true">
                {['१', '२', '३'][i]}
              </span>
              <span className="deva pillar__deva">{p.deva}</span>
              <h3>{p.title}</h3>
              <p className="muted">{p.text}</p>
            </SpotlightCard>
          ))}
        </div>
      </section>

      <section className="sutra-band">
        <span className="om-watermark" aria-hidden="true">
          ॐ
        </span>
        <div className="container sutra-band__inner">
          <p className="deva sutra-band__sanskrit">योगश्चित्तवृत्तिनिरोधः</p>
          <p className="sutra-band__translit">yogaś citta-vṛtti-nirodhaḥ</p>
          <p className="sutra-band__meaning">Yoga is the settling of the mind’s restless movements. (Yoga Sūtra 1.2)</p>
        </div>
      </section>
    </>
  );
}
