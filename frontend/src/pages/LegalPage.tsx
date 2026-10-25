import { Link } from 'react-router';
import './pages.css';

const TITLES = { terms: 'Terms of Use', privacy: 'Privacy Policy' } as const;

/**
 * Placeholder until the lawyer-reviewed texts are ready (docs/plan.md, "legal pages").
 * It states plainly that the document is being finalised rather than inventing legal text.
 */
export default function LegalPage({ doc }: { doc: keyof typeof TITLES }) {
  return (
    <section className="simple-page">
      <h1>{TITLES[doc]}</h1>
      <p>
        Our {TITLES[doc]} is being finalised with legal review and will be published here before Healthmarg opens to the
        public.
      </p>
      <p className="muted">Healthmarg offers wellbeing guidance, not medical diagnosis or treatment.</p>
      <Link to="/">Back to home</Link>
    </section>
  );
}
