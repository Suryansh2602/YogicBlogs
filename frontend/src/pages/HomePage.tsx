import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { BlurReveal } from '../components/motion/BlurReveal';
import { ArticleCard } from '../features/articles/ArticleCard';
import { readerApi } from '../features/articles/api';
import type { ArticleListItem } from '../features/articles/types';
import { useAuth } from '../features/auth/useAuth';
import { rituOn } from '../features/ritu/calendar';
import { RituArt } from '../features/ritu/RituArt';
import { RITU_NAMES } from '../features/ritu/names';
import { dateIn } from '../features/ritu/sun';
import './pages.css';

const PILLARS = [
  {
    deva: 'ऋतुचर्या',
    title: 'Life by the seasons',
    text: 'How Vata, Pitta and Kapha shift through the six ritus, and what to eat, practise and avoid in each.',
    to: '/ritucharya',
    cta: 'Explore the six ritus',
  },
  {
    deva: 'चिकित्सा',
    title: 'Ayurvedic ways to heal',
    text: 'Gentle remedies, diet and routines drawn from Ayurveda and written with yoga practitioners.',
    to: '/articles',
    cta: 'Read the articles',
  },
  {
    deva: 'श्रवण',
    title: 'Read at your pace',
    text: 'Clear, referenced articles with the classical source and the research beside each claim.',
  },
];

/** The newest published articles: one lead story, then a short list. Hidden until there are some. */
function LatestArticles() {
  const [items, setItems] = useState<ArticleListItem[] | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    readerApi.list({ limit: 4 }, { signal: controller.signal }).then(
      (data) => {
        setItems(data.items);
      },
      () => {
        if (!controller.signal.aborted) setItems([]); // the home page still works without them
      },
    );
    return () => {
      controller.abort();
    };
  }, []);
  // While loading, keep the space it will take, so the sections below don't jump when it arrives.
  if (items === null) return <div className="container home-section latest-placeholder" aria-hidden="true" />;
  if (!items.length) return null;
  const [lead, ...rest] = items;
  return (
    <section className="container home-section" aria-labelledby="latest-title">
      <header className="home-section__head">
        <h2 id="latest-title">Latest articles</h2>
        <Link to="/articles">All articles →</Link>
      </header>
      <div className="latest">
        {lead && (
          <div className="latest__lead">
            <ArticleCard article={lead} />
          </div>
        )}
        {rest.length > 0 && (
          <ul className="latest__list">
            {rest.map((a) => (
              <li key={a.slug}>
                <ArticleCard article={a} layout="row" />
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

export default function HomePage() {
  const { user } = useAuth();
  const today = dateIn('Asia/Kolkata');
  const rituId = rituOn(today.month, today.day);
  const ritu = RITU_NAMES[rituId];
  return (
    <>
      <section className="hero">
        <div className="container hero__grid">
          <div className="hero__text">
            <p className="eyebrow">
              <span className="deva dandas">स्वास्थ्य मार्ग</span> The path to wellbeing
            </p>
            <h1 className="hero__title">
              <BlurReveal text="Ancient wisdom for" /> <em className="hero__accent">modern ease</em>
            </h1>
            <p className="hero__lead">Understand the causes of everyday conditions and find Ayurvedic ways to heal, guided by yoga practitioners.</p>
            <div className="hero__actions">
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
                  <Link to="/articles" className="btn btn--secondary btn--lg">
                    <span className="btn__label">Read the articles</span>
                  </Link>
                </>
              )}
            </div>
          </div>
          <Link to={`/ritucharya?ritu=${rituId}`} className="hero__season">
            <RituArt ritu={rituId} className="hero__season-art" />
            <span className="hero__season-text">
              <span className="hero__season-kicker">This season</span>
              <span className="hero__season-name">
                {ritu.name} <span className="deva">{ritu.deva}</span> · {ritu.english}
              </span>
              <span className="hero__season-link">What to eat, practise and avoid now →</span>
            </span>
          </Link>
        </div>
      </section>

      <LatestArticles />

      <section className="container home-section" aria-labelledby="pillars-title">
        <header className="home-section__head">
          <h2 id="pillars-title">What you’ll find here</h2>
        </header>
        <ul className="pillars">
          {PILLARS.map((p) => (
            <li key={p.title} className="pillar">
              <span className="deva pillar__deva">{p.deva}</span>
              <h3>{p.title}</h3>
              <p className="muted">{p.text}</p>
              {p.to && (
                <Link to={p.to} className="pillar__link">
                  {p.cta} <span aria-hidden="true">→</span>
                </Link>
              )}
            </li>
          ))}
        </ul>
      </section>

      <section className="sutra-band">
        <div className="container sutra-band__inner">
          <p className="deva sutra-band__sanskrit">योगश्चित्तवृत्तिनिरोधः</p>
          <p className="sutra-band__translit">yogaś citta-vṛtti-nirodhaḥ</p>
          <p className="sutra-band__meaning">Yoga is the settling of the mind’s restless movements. (Yoga Sūtra 1.2)</p>
        </div>
      </section>
    </>
  );
}
