import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router';
import { Alert } from '../../components/ui/Alert';
import { Button } from '../../components/ui/Button';
import { Spinner } from '../../components/ui/Spinner';
import { Mandala } from '../../components/brand/Mandala';
import { ArticleBody } from '../../features/articles/ArticleBody';
import { ArticleCard, ReaderImg } from '../../features/articles/ArticleCard';
import { readerApi } from '../../features/articles/api';
import type { ReaderArticle } from '../../features/articles/types';
import { errorMessage } from '../../features/auth/errors';
import { useAuth } from '../../features/auth/useAuth';
import { ApiRequestError } from '../../services/apiClient';
import './articlePages.css';

const DISCLAIMER = 'For education only, not medical advice. Consult a qualified doctor or Ayurvedic practitioner before trying any remedy.';

type Result = { kind: 'article'; article: ReaderArticle } | { kind: 'notFound' } | { kind: 'error'; message: string };

const dateFormat = new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Kolkata' });
const formatDate = (iso: string | null) => {
  if (!iso) return null;
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? null : dateFormat.format(date);
};

/** Set the tab title (and description) while the page is open; the previous ones come back on leaving. */
function useDocumentMeta(title: string | null, description: string | null) {
  useEffect(() => {
    if (!title) return;
    const previous = document.title;
    document.title = `${title} · Healthmarg`;
    const meta = document.querySelector<HTMLMetaElement>('meta[name="description"]');
    const previousDescription = meta?.content;
    if (meta && description) meta.content = description;
    return () => {
      document.title = previous;
      if (meta && previousDescription !== undefined) meta.content = previousDescription;
    };
  }, [title, description]);
}

function ArticleHeader({ article }: { article: ReaderArticle }) {
  const published = formatDate(article.publishedAt);
  const updated = formatDate(article.updatedAt);
  return (
    <header className="article-head">
      {article.condition && (
        <Link className="article-head__condition" to={`/articles?condition=${encodeURIComponent(article.condition.slug)}`}>
          {article.condition.name}
        </Link>
      )}
      <h1 className="article-head__title" lang={article.lang}>
        {article.title}
      </h1>
      {article.summary && (
        <p className="article-head__summary" lang={article.lang}>
          {article.summary}
        </p>
      )}
      <p className="article-head__meta">
        <span>{article.readingMinutes} min read</span>
        {published && article.publishedAt && (
          <span>
            Published <time dateTime={article.publishedAt}>{published}</time>
          </span>
        )}
        {updated && article.updatedAt && updated !== published && (
          <span>
            Updated <time dateTime={article.updatedAt}>{updated}</time>
          </span>
        )}
      </p>
    </header>
  );
}

function Cover({ article }: { article: ReaderArticle }) {
  if (!article.cover) return null;
  return (
    <div className="article-cover">
      <ReaderImg image={article.cover} focus={article.coverFocus} eager sizes="(max-width: 62rem) calc(100vw - 2rem), 60rem" />
    </div>
  );
}

function Locked({ article }: { article: ReaderArticle }) {
  const location = useLocation();
  // The sign-in page sends the reader back here afterwards (it takes a path, never another site).
  const from = `${location.pathname}${location.search}`;
  return (
    <>
      <ArticleHeader article={article} />
      <Cover article={article} />
      <div className="article-lock" role="note" aria-labelledby="article-lock-title">
        <svg className="article-lock__icon" viewBox="0 0 24 24" width="28" height="28" aria-hidden="true" focusable="false">
          <rect x="5" y="10.5" width="14" height="10" rx="2.5" />
          <path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5M12 14.5v2.5" />
        </svg>
        <p id="article-lock-title" className="article-lock__title">
          This article is for members. Sign in to read it.
        </p>
        <p className="muted">Membership is free: create an account and every members article opens for you.</p>
        <div className="article-lock__actions">
          <Link to="/signin" state={{ from }} className="btn btn--primary btn--md">
            <span className="btn__label">Sign in</span>
          </Link>
          <Link to="/signup" state={{ from }} className="btn btn--secondary btn--md">
            <span className="btn__label">Create account</span>
          </Link>
        </div>
      </div>
    </>
  );
}

function Disclaimer() {
  return (
    <p className="article-disclaimer" role="note">
      <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false">
        <circle cx="12" cy="12" r="9" />
        <path d="M12 11v6M12 7.5v.5" />
      </svg>
      <span>{DISCLAIMER}</span>
    </p>
  );
}

export default function ArticlePage() {
  const { slug = '' } = useParams();
  const navigate = useNavigate();
  const { status, user } = useAuth();
  // Who is reading decides what comes back (a members article in full or as a teaser), so the article
  // loads again on sign-in or sign-out. While the session is still being restored, wait for it.
  const reader = status === 'loading' ? null : (user?.id ?? 'guest');
  const key = `${slug}|${reader ?? ''}|`;
  const [reloadKey, setReloadKey] = useState(0);
  const [result, setResult] = useState<{ key: string; value: Result } | null>(null);
  const requestKey = `${key}${String(reloadKey)}`;

  useEffect(() => {
    if (reader === null) return;
    const controller = new AbortController();
    readerApi.get(slug, { signal: controller.signal }).then(
      (data) => {
        if (controller.signal.aborted) return;
        // An old address: go to the article's current one, replacing this entry so Back still works.
        if ('redirect' in data) void navigate(`/articles/${encodeURIComponent(data.redirect)}`, { replace: true });
        else setResult({ key: requestKey, value: { kind: 'article', article: data.article } });
      },
      (err: unknown) => {
        if (controller.signal.aborted) return;
        const missing = err instanceof ApiRequestError && (err.status === 404 || err.status === 400);
        setResult({ key: requestKey, value: missing ? { kind: 'notFound' } : { kind: 'error', message: errorMessage(err) } });
      },
    );
    return () => {
      controller.abort();
    };
  }, [slug, reader, requestKey, navigate]);

  // While reloading (e.g. after signing in) the article on screen stays until the new copy arrives.
  const current = result?.key === requestKey ? result.value : null;
  const sameSlug = result?.key.startsWith(`${slug}|`) ? result.value : null;
  const shown = current ?? sameSlug;
  const article = shown?.kind === 'article' ? shown.article : null;

  useDocumentMeta(
    article ? article.seo.title : shown?.kind === 'notFound' ? 'Article not found' : null,
    article ? (article.seo.description ?? article.summary) : null,
  );

  if (!shown) {
    return (
      <div className="article-loading">
        <Spinner size={26} label="Loading the article" />
      </div>
    );
  }

  if (shown.kind === 'notFound') {
    return (
      <section className="article-missing">
        <Mandala size={130} spin={false} />
        <h1>We couldn’t find that article</h1>
        <p className="muted">It may have moved or been taken down, or the address may have a typo.</p>
        <Link to="/articles" className="btn btn--primary btn--md">
          <span className="btn__label">Browse all articles</span>
        </Link>
      </section>
    );
  }

  if (shown.kind === 'error') {
    return (
      <section className="article-missing">
        <Alert tone="danger" title="This article couldn’t load.">
          {shown.message}
        </Alert>
        <Button
          variant="secondary"
          onClick={() => {
            setReloadKey((k) => k + 1);
          }}
        >
          Try again
        </Button>
      </section>
    );
  }

  const { article: a } = shown;
  return (
    <article className={`article-page accent--${a.accent}`} aria-busy={!current || undefined}>
      {a.locked ? (
        <Locked article={a} />
      ) : (
        <>
          <ArticleHeader article={a} />
          <Cover article={a} />
          <div lang={a.lang}>
            <ArticleBody body={a.body} images={a.images} articles={a.articles} />
          </div>
          <footer className="article-foot">
            <div className="article-foot__ornament" aria-hidden="true">
              <span>॥</span>
            </div>
            <Disclaimer />
          </footer>
          {a.related.length > 0 && (
            <section className="article-related" aria-labelledby="related-title">
              <h2 id="related-title">Related reading</h2>
              <ul className="articles-grid">
                {a.related.map((r) => (
                  <li key={r.slug}>
                    <ArticleCard article={r} />
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}
    </article>
  );
}
