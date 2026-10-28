import { useEffect, useState, type SubmitEvent } from 'react';
import { Link, useLocation, useNavigate } from 'react-router';
import { Alert } from '../../components/ui/Alert';
import { Button } from '../../components/ui/Button';
import { Spinner } from '../../components/ui/Spinner';
import { TextField } from '../../components/ui/TextField';
import { adminArticlesApi } from '../../features/articles/api';
import type { ArticleStatus } from '../../features/articles/types';
import { conditionsApi, type Condition } from '../../features/content/api';
import { errorMessage, fieldErrors } from '../../features/auth/errors';
import { useAdminData } from './useAdminData';

const FILTERS: { value: ArticleStatus | ''; label: string }[] = [
  { value: '', label: 'All' },
  { value: 'draft', label: 'Drafts' },
  { value: 'published', label: 'Published' },
  { value: 'archived', label: 'Archived' },
];

function NewArticle({ conditions, onCancel }: { conditions: Condition[]; onCancel: () => void }) {
  const navigate = useNavigate();
  const [title, setTitle] = useState('');
  const [conditionId, setConditionId] = useState(conditions[0]?.id ?? '');
  const [errors, setErrors] = useState<{ title?: string | undefined; conditionId?: string | undefined; form?: string | undefined }>({});
  const [busy, setBusy] = useState(false);

  const submit = async (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    const problems = {
      title: title.trim().length < 3 ? 'Give it a title of at least 3 characters (you can change it later).' : undefined,
      conditionId: conditionId ? undefined : 'Choose what the article is about. Add conditions in Admin → Conditions first.',
    };
    setErrors(problems);
    if (problems.title || problems.conditionId) return;
    setBusy(true);
    try {
      const { article } = await adminArticlesApi.create({ title: title.trim(), conditionId });
      void navigate(`/admin/articles/${article.id}`);
    } catch (err) {
      const fields = fieldErrors(err);
      setErrors({ title: fields['title'], conditionId: fields['conditionId'], form: Object.keys(fields).length ? undefined : errorMessage(err) });
      setBusy(false);
    }
  };

  return (
    <form className="admin-form" onSubmit={(e) => void submit(e)} noValidate>
      <h2 className="admin-form__title">New article</h2>
      {errors.form && <Alert tone="danger">{errors.form}</Alert>}
      <div className="admin-form__grid">
        <TextField
          label="Title"
          value={title}
          maxLength={200}
          error={errors.title}
          autoFocus
          onChange={(e) => {
            setTitle(e.target.value);
            setErrors((er) => ({ ...er, title: undefined }));
          }}
        />
        <label className={`field ${errors.conditionId ? 'field--invalid' : ''}`}>
          <span className="field__label">Condition</span>
          <select
            className="field__input"
            value={conditionId}
            onChange={(e) => {
              setConditionId(e.target.value);
              setErrors((er) => ({ ...er, conditionId: undefined }));
            }}
          >
            {conditions.length === 0 && <option value="">No conditions yet</option>}
            {conditions.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          {errors.conditionId && <span className="field__error">{errors.conditionId}</span>}
        </label>
      </div>
      <div className="admin-form__actions">
        <Button type="submit" loading={busy}>
          Create and start writing
        </Button>
        <Button variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

export default function AdminArticles() {
  const location = useLocation();
  const [status, setStatus] = useState<ArticleStatus | ''>('');
  const [search, setSearch] = useState('');
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const [creating, setCreating] = useState(false);
  const [conditions, setConditions] = useState<Condition[]>([]);
  const deletedNotice = (location.state as { notice?: unknown } | null)?.notice;
  const result = useAdminData(() => adminArticlesApi.list({ page, pageSize: 20, status: status || undefined, q: q || undefined }), [page, status, q]);

  useEffect(() => {
    const timer = setTimeout(() => {
      setQ(search.trim());
      setPage(1);
    }, 300);
    return () => {
      clearTimeout(timer);
    };
  }, [search]);
  useEffect(() => {
    conditionsApi.list().then(
      (c) => {
        setConditions(c.items);
      },
      () => undefined,
    );
  }, []);

  const pages = result.status === 'ready' ? Math.max(1, Math.ceil(result.data.total / result.data.pageSize)) : 1;

  return (
    <>
      <header className="admin__header admin__header--row">
        <div>
          <h1>Articles</h1>
          <p className="muted">Write, design and publish articles. Drafts are never shown to readers.</p>
        </div>
        {!creating && (
          <Button
            onClick={() => {
              setCreating(true);
            }}
          >
            New article
          </Button>
        )}
      </header>

      {typeof deletedNotice === 'string' && <Alert tone="success">{deletedNotice}</Alert>}
      {creating && (
        <NewArticle
          conditions={conditions}
          onCancel={() => {
            setCreating(false);
          }}
        />
      )}

      <div className="chips" role="group" aria-label="Show">
        {FILTERS.map((f) => (
          <button
            key={f.value}
            type="button"
            className="chip"
            aria-pressed={status === f.value}
            onClick={() => {
              setStatus(f.value);
              setPage(1);
            }}
          >
            {f.label}
          </button>
        ))}
      </div>
      <TextField
        label="Search titles"
        type="search"
        value={search}
        onChange={(e) => {
          setSearch(e.target.value);
        }}
      />

      {result.status === 'error' && <Alert tone="danger">{result.message}</Alert>}
      <div className="table-wrap" aria-busy={result.status === 'loading'}>
        <table className="table">
          <thead>
            <tr>
              <th scope="col">Article</th>
              <th scope="col">Condition</th>
              <th scope="col">Status</th>
              <th scope="col">Last saved</th>
            </tr>
          </thead>
          <tbody>
            {result.status === 'loading' && (
              <tr>
                <td colSpan={4} className="table__empty">
                  <Spinner size={22} label="Loading articles" />
                </td>
              </tr>
            )}
            {result.status === 'ready' && result.data.items.length === 0 && (
              <tr>
                <td colSpan={4} className="table__empty muted">
                  {q || status ? 'No articles match.' : 'No articles yet. Create the first one.'}
                </td>
              </tr>
            )}
            {result.status === 'ready' &&
              result.data.items.map((a) => (
                <tr key={a.id}>
                  <td>
                    <Link to={`/admin/articles/${a.id}`}>
                      <strong>{a.title}</strong>
                    </Link>
                    {a.slug && <div className="muted table__sub">/articles/{a.slug}</div>}
                  </td>
                  <td>{a.condition.name ?? '—'}</td>
                  <td>
                    <span className={`badge ${a.status === 'published' ? 'badge--ok' : ''}`}>{a.status === 'published' ? 'Published' : a.status === 'archived' ? 'Archived' : 'Draft'}</span>
                    {a.hasUnpublishedChanges && <span className="badge badge--warn">Unpublished changes</span>}
                  </td>
                  <td className="muted">{new Date(a.updatedAt).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}</td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
      {pages > 1 && (
        <nav className="pager" aria-label="Pages">
          <Button
            size="sm"
            variant="secondary"
            disabled={page <= 1}
            onClick={() => {
              setPage((p) => p - 1);
            }}
          >
            Previous
          </Button>
          <span>
            Page {page} of {pages}
          </span>
          <Button
            size="sm"
            variant="secondary"
            disabled={page >= pages}
            onClick={() => {
              setPage((p) => p + 1);
            }}
          >
            Next
          </Button>
        </nav>
      )}
    </>
  );
}
