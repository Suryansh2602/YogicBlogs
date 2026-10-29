// The one design every error uses: a large code (only where it means something, like 404), a plain headline,
// what happened and what to do, then clear actions and (optionally) search and section links. No technical details.
import type { ReactNode } from 'react';
import { Link, useNavigate } from 'react-router';
import './errorView.css';

interface ErrorViewProps {
  /** Shown large above the headline when it means something to readers, e.g. "404". */
  code?: string;
  title: string;
  children: ReactNode;
  /** Buttons (primary first). */
  actions?: ReactNode;
  /** A search box: "articles" searches articles; omit for none. */
  search?: 'articles';
  /** Links to the main sections, for readers who want to carry on. */
  links?: boolean;
}

export function ErrorView({ code, title, children, actions, search, links = false }: ErrorViewProps) {
  const navigate = useNavigate();
  return (
    <section className="error-view" aria-labelledby="error-title">
      {code && (
        <p className="error-view__code" aria-hidden="true">
          {code}
        </p>
      )}
      <h1 id="error-title">{title}</h1>
      <div className="error-view__text">{children}</div>
      {actions && <div className="error-view__actions">{actions}</div>}
      {search && (
        <form
          role="search"
          className="error-view__search"
          onSubmit={(event) => {
            event.preventDefault();
            const q = new FormData(event.currentTarget).get('q');
            const text = typeof q === 'string' ? q.trim() : '';
            void navigate(text ? `/articles?q=${encodeURIComponent(text)}` : '/articles');
          }}
        >
          <label htmlFor="error-search">Search the articles</label>
          <div className="error-view__search-row">
            <input id="error-search" name="q" type="search" className="field__input" placeholder="Try “sleep” or “digestion”" maxLength={100} />
            <button type="submit" className="btn btn--secondary btn--md">
              <span className="btn__label">Search</span>
            </button>
          </div>
        </form>
      )}
      {links && (
        <nav aria-label="Helpful links" className="error-view__links">
          <Link to="/">Home</Link>
          <Link to="/articles">Articles</Link>
          <Link to="/ritucharya">Ritucharya: the six seasons</Link>
        </nav>
      )}
    </section>
  );
}
