import type { ReactNode } from 'react';
import { Mandala } from '../brand/Mandala';
import { LogoMark } from '../brand/Logo';
import { Aurora } from '../motion/Aurora';
import { Nakshatra } from '../brand/Nakshatra';
import './layout.css';

interface AuthLayoutProps {
  title: string;
  subtitle?: ReactNode;
  children: ReactNode;
  /** The decorative side panel's verse. */
  verse?: { sanskrit: string; transliteration: string; meaning: string };
}

const DEFAULT_VERSE = {
  sanskrit: 'योगः कर्मसु कौशलम्',
  transliteration: 'yogaḥ karmasu kauśalam',
  meaning: 'Yoga is skill in action. (Bhagavad Gītā 2.50)',
};

/** Split screen for sign-in/sign-up: a calm mandala panel with a verse, and the form card. */
export function AuthLayout({ title, subtitle, children, verse = DEFAULT_VERSE }: AuthLayoutProps) {
  return (
    <div className="auth">
      <aside className="auth__art" aria-hidden="true">
        <Aurora />
        <Nakshatra />
        <Mandala size={560} className="auth__mandala" />
        <div className="auth__verse">
          <LogoMark size={64} animated />
          <p className="deva auth__sanskrit">{verse.sanskrit}</p>
          <p className="auth__translit">{verse.transliteration}</p>
          <p className="auth__meaning">{verse.meaning}</p>
        </div>
      </aside>
      <section className="auth__panel">
        <div className="auth__card rise-in">
          <h1 className="auth__title">{title}</h1>
          {subtitle && <p className="auth__subtitle muted">{subtitle}</p>}
          {children}
        </div>
      </section>
    </div>
  );
}
