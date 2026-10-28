import { useEffect, useRef, useState, type SubmitEvent } from 'react';
import { useSearchParams } from 'react-router';
import { Alert } from '../../components/ui/Alert';
import { Button } from '../../components/ui/Button';
import { Spinner } from '../../components/ui/Spinner';
import { TextField } from '../../components/ui/TextField';
import { Mandala } from '../../components/brand/Mandala';
import { ArticleCard } from '../../features/articles/ArticleCard';
import { readerApi } from '../../features/articles/api';
import type { ArticleListItem } from '../../features/articles/types';
import { errorMessage } from '../../features/auth/errors';
import { apiClient } from '../../services/apiClient';
import './articlePages.css';

const PAGE_SIZE = 12;
const SEARCH_DELAY_MS = 300;
const MAX_SEARCH = 100;

interface PublicCondition {
  id: string;
  name: string;
  slug: string;
  summary: string | null;
}

interface ListState {
  /** The filters this result belongs to ("condition|q"): a slow, stale answer never replaces a newer one. */
  key: string;
  items: ArticleListItem[];
  nextCursor: string | null;
  error: string | null;
}

export default function ArticlesPage() {
  const [params, setParams] = useSearchParams();
  const condition = params.get('condition')?.trim() ?? '';
  const q = (params.get('q') ?? '').trim().slice(0, MAX_SEARCH);
  const key = `${condition}|${q}`;

  // ── Condition chips ──
  const [conditions, setConditions] = useState<{ items: PublicCondition[]; error: string | null } | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    apiClient.get<{ items: PublicCondition[] }>('/conditions', { signal: controller.signal }).then(
      (data) => {
        setConditions({ items: data.items, error: null });
      },
      (err: unknown) => {
        if (!controller.signal.aborted) setConditions({ items: [], error: errorMessage(err) });
      },
    );
    return () => {
      controller.abort();
    };
  }, []);

  // ── Search field: the address bar follows the text ~300 ms after typing stops (or at once on submit) ──
  const [text, setText] = useState(q);
  const [syncedQ, setSyncedQ] = useState(q);
  if (q !== syncedQ) {
    // The address changed from outside (back button, a chip link): show what is being searched.
    setSyncedQ(q);
    if (text.trim() !== q) setText(q);
  }

  const update = (changes: Record<string, string>, replace: boolean) => {
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        for (const [name, value] of Object.entries(changes)) {
          if (value) next.set(name, value);
          else next.delete(name);
        }
        return next;
      },
      { replace },
    );
  };

  useEffect(() => {
    const wanted = text.trim();
    if (wanted === q) return;
    const timer = setTimeout(() => {
      update({ q: wanted }, true);
    }, SEARCH_DELAY_MS);
    return () => {
      clearTimeout(timer);
    };
    // `update` only wraps setParams, which is stable.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text, q]);

  const onSearch = (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    update({ q: text.trim() }, true);
  };

  // ── The list ──
  const [list, setList] = useState<ListState | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  // "Load more" progress, kept with the filters it belongs to (new filters start clean).
  const [more, setMore] = useState<{ key: string; loading: boolean; error: string | null } | null>(null);
  const [announcement, setAnnouncement] = useState('');
  const focusIndex = useRef<number | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    readerApi.list({ condition: condition || undefined, q: q || undefined, limit: PAGE_SIZE }, { signal: controller.signal }).then(
      (data) => {
        setList({ key, items: data.items, nextCursor: data.nextCursor, error: null });
        setAnnouncement(data.items.length ? `${data.nextCursor ? 'Showing the first' : 'Showing'} ${String(data.items.length)} article${data.items.length === 1 ? '' : 's'}.` : 'No articles found.');
      },
      (err: unknown) => {
        if (controller.signal.aborted) return;
        const message = errorMessage(err);
        setList({ key, items: [], nextCursor: null, error: message });
        setAnnouncement(message);
      },
    );
    return () => {
      controller.abort();
    };
  }, [key, condition, q, reloadKey]);

  const current = list?.key === key ? list : null;
  const shown = current ?? list; // the previous result stays on screen (dimmed) while new filters load
  const loading = !current;
  const moreNow = more?.key === key ? more : null;

  const loadMore = async () => {
    if (!current?.nextCursor) return;
    const forKey = key;
    setMore({ key: forKey, loading: true, error: null });
    try {
      const data = await readerApi.list({ condition: condition || undefined, q: q || undefined, cursor: current.nextCursor, limit: PAGE_SIZE });
      focusIndex.current = current.items.length;
      setList((prev) => (prev?.key === forKey ? { ...prev, items: [...prev.items, ...data.items.filter((i) => !prev.items.some((p) => p.slug === i.slug))], nextCursor: data.nextCursor } : prev));
      setMore({ key: forKey, loading: false, error: null });
      setAnnouncement(`${String(data.items.length)} more article${data.items.length === 1 ? '' : 's'} loaded.`);
    } catch (err) {
      const message = errorMessage(err);
      setMore({ key: forKey, loading: false, error: `More articles couldn’t load. ${message}` });
      setAnnouncement(message);
    }
  };

  const chosen = conditions?.items.find((c) => c.slug === condition);
  const filtered = Boolean(condition || q);

  return (
    <section className="articles-page container">
      <header className="articles-hero">
        <Mandala size={260} spin={false} className="articles-hero__mandala" />
        <p className="eyebrow">
          <span className="deva">लेख</span> Articles
        </p>
        <h1>Read and heal</h1>
        <p className="muted articles-hero__lead">Clear explanations of common conditions, and gentle Ayurvedic and yogic ways to ease them.</p>
      </header>

      <div className="articles-tools">
        <form role="search" className="articles-search" onSubmit={onSearch}>
          <TextField
            label="Search articles"
            type="search"
            value={text}
            maxLength={MAX_SEARCH}
            placeholder="Try “sleep” or “digestion”"
            enterKeyHint="search"
            onChange={(e) => {
              setText(e.target.value);
            }}
          />
          <Button type="submit" variant="secondary">
            Search
          </Button>
        </form>

        <div className="chips" role="group" aria-label="Filter by condition">
          <button
            type="button"
            className="chip"
            aria-pressed={!condition}
            onClick={() => {
              update({ condition: '' }, false);
            }}
          >
            All
          </button>
          {conditions?.items.map((c) => (
            <button
              key={c.id}
              type="button"
              className="chip"
              aria-pressed={c.slug === condition}
              onClick={() => {
                update({ condition: c.slug === condition ? '' : c.slug }, false);
              }}
            >
              {c.name}
            </button>
          ))}
        </div>
        {conditions?.error && <p className="articles-note muted">The condition filters couldn’t load: {conditions.error}</p>}
      </div>

      <div className="visually-hidden" aria-live="polite" data-testid="articles-announcer">
        {announcement}
      </div>

      {current?.error && (
        <div className="articles-error">
          <Alert tone="danger" title="The articles couldn’t load.">
            {current.error}
          </Alert>
          <Button
            variant="secondary"
            onClick={() => {
              setReloadKey((k) => k + 1);
            }}
          >
            Try again
          </Button>
        </div>
      )}

      {!shown && loading && (
        <div className="articles-empty">
          <Spinner size={24} label="Loading articles" />
        </div>
      )}

      {current && !current.error && current.items.length === 0 && (
        <div className="articles-empty">
          {filtered ? (
            <>
              <p>
                No articles match
                {q ? ` “${q}”` : ''}
                {condition ? ` in ${chosen?.name ?? 'this condition'}` : ''} yet.
              </p>
              <Button
                variant="secondary"
                onClick={() => {
                  setText('');
                  update({ q: '', condition: '' }, false);
                }}
              >
                Show all articles
              </Button>
            </>
          ) : (
            <p>No articles yet. The first ones are being written.</p>
          )}
        </div>
      )}

      {shown && shown.items.length > 0 && (
        <ul className={`articles-grid ${loading ? 'articles-grid--loading' : ''}`} aria-label="Articles" aria-busy={loading}>
          {shown.items.map((item, i) => (
            <li key={item.slug}>
              <ArticleCard
                article={item}
                headingLevel={2}
                ref={(el) => {
                  if (el && focusIndex.current === i) {
                    focusIndex.current = null;
                    el.focus();
                  }
                }}
              />
            </li>
          ))}
        </ul>
      )}

      {current?.nextCursor && (
        <div className="articles-more">
          {moreNow?.error && <Alert tone="danger">{moreNow.error}</Alert>}
          <Button variant="secondary" loading={moreNow?.loading ?? false} onClick={() => void loadMore()}>
            Load more
          </Button>
        </div>
      )}
    </section>
  );
}
