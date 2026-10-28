import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import type { JSONContent } from '@tiptap/react';
import { Alert } from '../../components/ui/Alert';
import { Button } from '../../components/ui/Button';
import { Spinner } from '../../components/ui/Spinner';
import { TextArea } from '../../components/ui/TextArea';
import { TextField } from '../../components/ui/TextField';
import { apiUrl, ApiRequestError } from '../../services/apiClient';
import { conditionsApi, mediaApi, type Condition, type MediaItem } from '../../features/content/api';
import { adminArticlesApi } from '../../features/articles/api';
import { toServerDoc } from '../../features/articles/sanitize';
import { ArticleBody } from '../../features/articles/ArticleBody';
import type { AdminArticle, AdminArticleListItem, ArticleDraft, CardAccent, ChecklistProblem, ReaderArticle, RevisionSummary } from '../../features/articles/types';
import { errorMessage } from '../../features/auth/errors';
import { ArticleBodyEditor } from '../../features/editor/ArticleBodyEditor';
import { clearCrashCopy, readCrashCopy, saveStatusText, useAutosave } from '../../features/editor/useAutosave';
import type { EditorLookups } from '../../features/editor/lookups';
import './articleEditor.css';

const ACCENTS: { id: CardAccent; label: string }[] = [
  { id: 'saffron', label: 'Saffron' },
  { id: 'teal', label: 'Teal' },
  { id: 'lotus', label: 'Lotus' },
  { id: 'gold', label: 'Gold' },
];

const REVISION_LABEL: Record<RevisionSummary['reason'], string> = {
  publish: 'Published',
  manual: 'Saved by hand',
  autosnap: 'Autosaved snapshot',
  restore: 'Before a restore',
  delete: 'Before deleting',
};

const STATUS_LABEL = (a: AdminArticle) =>
  a.status === 'published' ? (a.hasUnpublishedChanges ? 'Published · unpublished changes' : 'Published') : a.status === 'archived' ? 'Archived' : 'Draft';

const when = (iso: string) =>
  new Date(iso).toLocaleString('en-IN', {
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
  });

type Confirm = null | {
  action: 'unpublish' | 'archive' | 'delete';
  message: string;
};
interface Notice {
  tone: 'success' | 'danger' | 'info';
  text: string;
}
/**
 * Restart the editor on this copy; the message survives the restart (shown by the new editor). `unsaved`
 * means the copy isn't on the server yet (a restored browser copy), so the new editor saves it.
 */
type ReloadFn = (article: AdminArticle, flash?: Notice, unsaved?: boolean) => void;

const NOT_SAVED = 'Your latest changes aren’t saved yet, so this wasn’t done. Wait for “Saved”, or fix what the status line says, then try again.';

function Editor({ initial, conditions, flash, unsaved, onReload }: { initial: AdminArticle; conditions: Condition[]; flash: Notice | null; unsaved: boolean; onReload: ReloadFn }) {
  const navigate = useNavigate();
  const [article, setArticle] = useState(initial);
  const [draft, setDraft] = useState<ArticleDraft>(initial.draft);
  const body = useRef<JSONContent>(initial.draft.body as JSONContent);
  const [checklist, setChecklist] = useState(initial.checklist);
  const [notice, setNotice] = useState<Notice | null>(flash);
  const [problems, setProblems] = useState<ChecklistProblem[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<Confirm>(null);
  const [preview, setPreview] = useState<ReaderArticle | null>(null);
  const [revisions, setRevisions] = useState<RevisionSummary[] | null>(null);
  const [crash, setCrash] = useState(() => {
    const copy = readCrashCopy(initial.id);
    return copy && JSON.stringify(copy.draft) !== JSON.stringify(initial.draft) ? copy : null;
  });
  // What the editor's blocks show: library images and linked articles' titles.
  const [media, setMedia] = useState<Record<string, MediaItem>>({});
  const [articles, setArticles] = useState<
    Record<
      string,
      {
        title: string | null;
        state: AdminArticle['status'] | 'deleted' | 'missing';
      }
    >
  >(() => Object.fromEntries(initial.references.map((r) => [r.articleId.toLowerCase(), { title: r.title, state: r.state }])));
  useEffect(() => {
    let current = true;
    mediaApi.list(1, 100).then(
      (res) => {
        if (current)
          setMedia((m) => ({
            ...Object.fromEntries(res.items.map((i) => [i.id.toLowerCase(), i])),
            ...m,
          }));
      },
      () => undefined, // previews only: the editor still works without them
    );
    return () => {
      current = false;
    };
  }, []);
  const lookups = useMemo<EditorLookups>(() => ({ media: (id) => media[id], article: (id) => articles[id] }), [media, articles]);

  const refreshChecklist = useCallback(() => {
    adminArticlesApi.checklist(article.id).then(
      (c) => {
        setChecklist((cur) => ({ ...cur, ...c }));
      },
      () => undefined,
    );
  }, [article.id]);
  const checklistTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const autosave = useAutosave({
    articleId: article.id,
    initialVersion: initial.draftVersion,
    initialSavedAt: initial.savedAt,
    onSaved: (r) => {
      setArticle((a) => ({
        ...a,
        draftVersion: r.draftVersion,
        hasUnpublishedChanges: r.hasUnpublishedChanges,
        savedAt: r.savedAt,
      }));
      if (checklistTimer.current) clearTimeout(checklistTimer.current);
      checklistTimer.current = setTimeout(refreshChecklist, 1_500);
    },
  });

  // A restored browser copy isn't on the server yet: save it.
  const { schedule } = autosave;
  useEffect(() => {
    if (unsaved) schedule(initial.draft);
  }, [unsaved, schedule, initial.draft]);
  // A browser copy made before someone else's save would overwrite their work if restored.
  const crashIsOld = crash !== null && crash.basedOnVersion !== initial.draftVersion;

  /** Everything saved first; null (and a message) when the latest changes couldn't be. */
  const saved = async () => {
    const version = await autosave.flush();
    if (version === null) setNotice({ tone: 'danger', text: NOT_SAVED });
    return version;
  };

  const current = (next: Partial<ArticleDraft> = {}): ArticleDraft => ({
    ...draft,
    ...next,
    body: toServerDoc(body.current),
  });
  const change = (next: Partial<ArticleDraft>) => {
    setDraft((d) => ({ ...d, ...next }));
    autosave.schedule(current(next));
    setNotice(null);
  };

  /** After a conflict: load the newest server copy. This browser's copy is kept and offered again. */
  const loadTheirs = async () => {
    setBusy('reload');
    try {
      const { article: fresh } = await adminArticlesApi.get(article.id);
      onReload(fresh, {
        tone: 'success',
        text: 'Loaded the newest version. Your changes are still offered above.',
      });
    } catch (err) {
      setNotice({ tone: 'danger', text: errorMessage(err) });
    } finally {
      setBusy(null);
    }
  };

  const act = async (label: string, work: () => Promise<{ article: AdminArticle }>, success: string) => {
    setBusy(label);
    setNotice(null);
    setProblems(null);
    try {
      const { article: fresh } = await work();
      onReload(fresh, { tone: 'success', text: success });
    } catch (err) {
      if (err instanceof ApiRequestError && err.code === 'PUBLISH_CHECKLIST' && Array.isArray(err.details)) {
        setProblems(err.details as ChecklistProblem[]);
        setNotice({
          tone: 'danger',
          text: 'Not published yet: fix the items below.',
        });
      } else if (err instanceof ApiRequestError && err.code === 'HAS_INBOUND_LINKS') {
        const action = label === 'archive' ? 'archive' : 'unpublish';
        setConfirm({ action, message: err.message });
      } else {
        setNotice({ tone: 'danger', text: errorMessage(err) });
      }
    } finally {
      setBusy(null);
    }
  };

  const publish = async () => {
    const version = await saved();
    if (version === null) return;
    await act('publish', () => adminArticlesApi.publish(article.id, version), article.status === 'published' ? 'Changes published.' : 'Published: readers can see it now.');
  };

  const remove = async (confirmLinks: boolean) => {
    setBusy('delete');
    try {
      const version = await saved();
      if (version === null) return;
      await adminArticlesApi.remove(article.id, version, confirmLinks);
      clearCrashCopy(article.id);
      void navigate('/admin/articles', {
        replace: true,
        state: { notice: `“${draft.title}” was deleted.` },
      });
    } catch (err) {
      if (err instanceof ApiRequestError && err.code === 'HAS_INBOUND_LINKS') setConfirm({ action: 'delete', message: err.message });
      else setNotice({ tone: 'danger', text: errorMessage(err) });
    } finally {
      setBusy(null);
    }
  };

  const copyToNew = async (mine: ArticleDraft = current()) => {
    setBusy('copy');
    try {
      const { article: created } = await adminArticlesApi.create({
        title: `${mine.title} (copy)`.slice(0, 200),
        conditionId: mine.conditionId,
      });
      await adminArticlesApi.saveDraft(created.id, created.draftVersion, {
        ...mine,
        title: `${mine.title} (copy)`.slice(0, 200),
        slug: '',
      });
      clearCrashCopy(article.id);
      void navigate(`/admin/articles/${created.id}`);
    } catch (err) {
      setNotice({ tone: 'danger', text: errorMessage(err) });
    } finally {
      setBusy(null);
    }
  };

  const pickFocal = (event: MouseEvent<HTMLButtonElement>) => {
    const box = event.currentTarget.getBoundingClientRect();
    const focalX = Math.round(((event.clientX - box.left) / box.width) * 100);
    const focalY = Math.round(((event.clientY - box.top) / box.height) * 100);
    change({
      cover: {
        ...draft.cover,
        focalX: Math.min(100, Math.max(0, focalX)),
        focalY: Math.min(100, Math.max(0, focalY)),
      },
    });
  };

  const coverItem = draft.cover.mediaId ? media[draft.cover.mediaId.toLowerCase()] : undefined;
  const coverVariant = coverItem?.variants.find((v) => v.width >= 480) ?? coverItem?.variants.at(-1);
  const [coverPicker, setCoverPicker] = useState(false);
  const [relatedQuery, setRelatedQuery] = useState('');
  const [relatedResults, setRelatedResults] = useState<AdminArticleListItem[]>([]);
  useEffect(() => {
    if (!relatedQuery.trim()) return;
    let currentQuery = true;
    const timer = setTimeout(() => {
      adminArticlesApi.list({ q: relatedQuery.trim(), pageSize: 8 }).then(
        (res) => {
          if (currentQuery) setRelatedResults(res.items.filter((a) => a.id !== article.id && !draft.relatedIds.includes(a.id)));
        },
        () => undefined,
      );
    }, 250);
    return () => {
      currentQuery = false;
      clearTimeout(timer);
    };
  }, [relatedQuery, article.id, draft.relatedIds]);

  const conflict = autosave.state.kind === 'conflict';
  const deleted = autosave.state.kind === 'deleted';
  const blocking = (problems ?? checklist.problems).filter((p) => p.blocking);
  const warnings = checklist.problems.filter((p) => !p.blocking);
  const summaryLength = draft.summary.length;
  // The address readers will use: the one typed here, else the current published one.
  const address = draft.slug !== '' ? draft.slug : article.slug;
  const addressHint = address ? `/articles/${address}` : 'Made from the title when you first publish.';

  return (
    <div className="article-editor">
      <header className="article-editor__bar">
        <div>
          <Link to="/admin/articles" className="muted">
            ← Articles
          </Link>
          <p className="article-editor__status">
            <span className={`badge ${article.status === 'published' ? 'badge--ok' : ''}`}>{STATUS_LABEL(article)}</span>{' '}
            <span className={`save-status save-status--${autosave.state.kind}`} role="status" aria-live="polite">
              {saveStatusText(autosave.state)}
            </span>
          </p>
        </div>
        <div className="article-editor__actions">
          <Button
            variant="secondary"
            onClick={() => {
              void (async () => {
                if ((await saved()) === null) return;
                try {
                  setPreview((await adminArticlesApi.preview(article.id)).preview);
                } catch (err) {
                  setNotice({ tone: 'danger', text: errorMessage(err) });
                }
              })();
            }}
          >
            Preview
          </Button>
          <Button loading={busy === 'publish'} disabled={conflict || deleted} onClick={() => void publish()}>
            {article.status === 'published' ? 'Publish changes' : 'Publish'}
          </Button>
        </div>
      </header>

      {crash && (
        <Alert tone="info">
          This browser has unsaved changes from {when(crash.at)}. {crashIsOld && <strong>Someone saved this article after them: restoring replaces that newer version. </strong>}
          <Button
            size="sm"
            onClick={() => {
              setCrash(null);
              onReload({ ...article, draft: crash.draft }, { tone: 'info', text: 'Restored. Saving them now.' }, true);
            }}
          >
            {crashIsOld ? 'Restore them anyway' : 'Restore them'}
          </Button>{' '}
          {crashIsOld && (
            <>
              <Button size="sm" variant="secondary" loading={busy === 'copy'} onClick={() => void copyToNew(crash.draft)}>
                Keep them as a new article
              </Button>{' '}
            </>
          )}
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              clearCrashCopy(article.id);
              setCrash(null);
            }}
          >
            Discard
          </Button>
        </Alert>
      )}
      {conflict && (
        <Alert tone="danger" title="Someone else saved this article">
          {autosave.state.kind === 'conflict' && autosave.state.message} Your latest changes are kept in this browser.{' '}
          <Button size="sm" loading={busy === 'reload'} onClick={() => void loadTheirs()}>
            Load their version
          </Button>{' '}
          <Button size="sm" variant="secondary" loading={busy === 'copy'} onClick={() => void copyToNew()}>
            Keep mine as a new article
          </Button>
        </Alert>
      )}
      {deleted && (
        <Alert tone="danger" title="This article was deleted">
          Your text is still here.{' '}
          <Button size="sm" loading={busy === 'copy'} onClick={() => void copyToNew()}>
            Copy it into a new article
          </Button>
        </Alert>
      )}
      {notice && <Alert tone={notice.tone}>{notice.text}</Alert>}

      <div className="article-editor__layout">
        <div className="article-editor__main">
          <section className="card-panel" aria-labelledby="card-title">
            <h2 id="card-title">Card and thumbnail</h2>
            <TextField
              label="Title"
              value={draft.title}
              maxLength={200}
              onChange={(e) => {
                change({ title: e.target.value });
              }}
            />
            <TextArea
              label="Short description"
              value={draft.summary}
              maxLength={500}
              hint={`${String(summaryLength)} characters · 40–300 to publish. Shown on cards and in search results.`}
              onChange={(e) => {
                change({ summary: e.target.value });
              }}
            />
            <div className="card-panel__grid">
              <TextField
                label="Web address"
                value={draft.slug}
                maxLength={220}
                spellCheck={false}
                hint={addressHint}
                onChange={(e) => {
                  change({ slug: e.target.value.toLowerCase() });
                }}
              />
              <label className="field">
                <span className="field__label">Condition</span>
                <select
                  className="field__input"
                  value={draft.conditionId}
                  onChange={(e) => {
                    change({ conditionId: e.target.value });
                  }}
                >
                  {conditions.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                      {c.isPublished ? '' : ' (hidden)'}
                    </option>
                  ))}
                </select>
              </label>
              <fieldset className="segmented">
                <legend>Who can read it</legend>
                <label>
                  <input
                    type="radio"
                    name="access"
                    checked={draft.accessLevel === 'members'}
                    onChange={() => {
                      change({ accessLevel: 'members' });
                    }}
                  />{' '}
                  Members
                </label>
                <label>
                  <input
                    type="radio"
                    name="access"
                    checked={draft.accessLevel === 'public'}
                    onChange={() => {
                      change({ accessLevel: 'public' });
                    }}
                  />{' '}
                  Everyone
                </label>
              </fieldset>
              <fieldset className="segmented">
                <legend>Language</legend>
                <label>
                  <input
                    type="radio"
                    name="lang"
                    checked={draft.lang === 'en'}
                    onChange={() => {
                      change({ lang: 'en' });
                    }}
                  />{' '}
                  English
                </label>
                <label>
                  <input
                    type="radio"
                    name="lang"
                    checked={draft.lang === 'hi'}
                    onChange={() => {
                      change({ lang: 'hi' });
                    }}
                  />{' '}
                  हिन्दी
                </label>
              </fieldset>
            </div>
            <fieldset className="accent-picker">
              <legend>Card colour</legend>
              {ACCENTS.map((a) => (
                <label key={a.id} className={`accent-swatch accent-swatch--${a.id}`}>
                  <input
                    type="radio"
                    name="accent"
                    checked={draft.accent === a.id}
                    onChange={() => {
                      change({ accent: a.id });
                    }}
                  />
                  <span>{a.label}</span>
                </label>
              ))}
            </fieldset>

            <div className="cover-field">
              <span className="field__label">Thumbnail</span>
              {coverVariant ? (
                <button type="button" className="cover-field__frame" onClick={pickFocal} aria-label="Click on the most important part of the image to set its focal point">
                  <img src={apiUrl(coverVariant.url)} alt="" />
                  <span
                    className="cover-field__dot"
                    style={{
                      left: `${String(draft.cover.focalX)}%`,
                      top: `${String(draft.cover.focalY)}%`,
                    }}
                    aria-hidden="true"
                  />
                </button>
              ) : (
                <p className="muted">No thumbnail yet.</p>
              )}
              <p className="muted cover-field__hint">
                Click the image to mark what must stay visible when it’s cropped (focal point {draft.cover.focalX}% × {draft.cover.focalY}%).
              </p>
              <Button
                size="sm"
                variant="secondary"
                onClick={() => {
                  setCoverPicker((v) => !v);
                }}
              >
                {coverVariant ? 'Change thumbnail' : 'Choose thumbnail'}
              </Button>
              {coverPicker && (
                <ul className="picker-grid" aria-label="Library images">
                  {Object.values(media).map((m) => {
                    const v = m.variants[0];
                    return (
                      <li key={m.id}>
                        <button
                          type="button"
                          className="picker-image"
                          onClick={() => {
                            change({
                              cover: { ...draft.cover, mediaId: m.id },
                            });
                            setCoverPicker(false);
                          }}
                          aria-label={`Use ${m.altText !== '' ? m.altText : (m.originalName ?? 'image')} as thumbnail`}
                        >
                          {v && <img src={apiUrl(v.url)} alt="" />}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
              <TextField
                label="Thumbnail alt text (optional: the library’s alt is used if empty)"
                value={draft.cover.alt}
                maxLength={255}
                onChange={(e) => {
                  change({ cover: { ...draft.cover, alt: e.target.value } });
                }}
              />
            </div>

            <div className="related-field">
              <span className="field__label">Related articles ({draft.relatedIds.length}/6)</span>
              <ul className="related-list">
                {draft.relatedIds.map((rid) => (
                  <li key={rid}>
                    {articles[rid.toLowerCase()]?.title ?? 'An article'}{' '}
                    <Button
                      size="sm"
                      variant="ghost"
                      aria-label={`Remove ${articles[rid.toLowerCase()]?.title ?? 'article'} from related`}
                      onClick={() => {
                        change({
                          relatedIds: draft.relatedIds.filter((x) => x !== rid),
                        });
                      }}
                    >
                      Remove
                    </Button>
                  </li>
                ))}
              </ul>
              {draft.relatedIds.length < 6 && (
                <>
                  <TextField
                    label="Add a related article"
                    value={relatedQuery}
                    onChange={(e) => {
                      setRelatedQuery(e.target.value);
                    }}
                    placeholder="Search by title"
                  />
                  {relatedQuery.trim() && (
                    <ul className="picker-list">
                      {relatedResults.map((a) => (
                        <li key={a.id}>
                          <button
                            type="button"
                            className="picker-item"
                            onClick={() => {
                              setArticles((m) => ({
                                ...m,
                                [a.id.toLowerCase()]: {
                                  title: a.title,
                                  state: a.status,
                                },
                              }));
                              change({
                                relatedIds: [...draft.relatedIds, a.id.toLowerCase()],
                              });
                              setRelatedQuery('');
                            }}
                          >
                            <span>{a.title}</span> <span className="badge">{a.status}</span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </>
              )}
            </div>

            <details className="seo-fields">
              <summary>Search engines (optional)</summary>
              <TextField
                label="Search title"
                value={draft.seoTitle}
                maxLength={70}
                hint={`${String(draft.seoTitle.length)}/70 · the title is used if empty`}
                onChange={(e) => {
                  change({ seoTitle: e.target.value });
                }}
              />
              <TextArea
                label="Search description"
                value={draft.seoDescription}
                maxLength={160}
                hint={`${String(draft.seoDescription.length)}/160 · the short description is used if empty`}
                onChange={(e) => {
                  change({ seoDescription: e.target.value });
                }}
              />
            </details>
          </section>

          <section className="body-panel" aria-label="Article text">
            <ArticleBodyEditor
              articleId={article.id}
              initial={initial.draft.body}
              lookups={lookups}
              onChange={(json) => {
                body.current = json;
                autosave.schedule(current());
              }}
              onPickMedia={(m) => {
                setMedia((all) => ({ ...all, [m.id.toLowerCase()]: m }));
              }}
              onPickArticle={(a) => {
                setArticles((all) => ({
                  ...all,
                  [a.id.toLowerCase()]: { title: a.title, state: a.status },
                }));
              }}
            />
          </section>
        </div>

        <aside className="article-editor__side">
          <section className="side-card" aria-labelledby="checklist-title">
            <h2 id="checklist-title">Ready to publish?</h2>
            {blocking.length === 0 ? (
              <p className="checklist-ok">✓ Everything needed is in place.</p>
            ) : (
              <ul className="checklist">
                {blocking.map((p) => (
                  <li key={`${p.field}-${p.message}`}>{p.message}</li>
                ))}
              </ul>
            )}
            {warnings.length > 0 && (
              <ul className="checklist checklist--warn">
                {warnings.map((p) => (
                  <li key={`${p.field}-${p.message}`}>{p.message}</li>
                ))}
              </ul>
            )}
          </section>

          <section className="side-card" aria-labelledby="manage-title">
            <h2 id="manage-title">Manage</h2>
            {article.savedBy && (
              <p className="muted">
                Last saved by {article.savedBy}, {when(article.savedAt)}.
              </p>
            )}
            {article.inboundCount > 0 && (
              <p className="muted">
                {article.inboundCount} published article
                {article.inboundCount === 1 ? ' links' : 's link'} here.
              </p>
            )}
            <div className="side-card__buttons">
              {article.status === 'published' && article.hasUnpublishedChanges && (
                <Button
                  size="sm"
                  variant="secondary"
                  loading={busy === 'discard'}
                  onClick={() =>
                    void act(
                      'discard',
                      async () => {
                        await autosave.flush();
                        clearCrashCopy(article.id);
                        return adminArticlesApi.discardDraft(article.id, autosave.version.current);
                      },
                      'Back to the published version.',
                    )
                  }
                >
                  Discard changes
                </Button>
              )}
              {article.status !== 'draft' && (
                <Button
                  size="sm"
                  variant="secondary"
                  loading={busy === 'unpublish'}
                  onClick={() => void act('unpublish', () => adminArticlesApi.unpublish(article.id), 'Unpublished: readers can’t see it now.')}
                >
                  Unpublish
                </Button>
              )}
              {article.status === 'published' && (
                <Button size="sm" variant="secondary" loading={busy === 'archive'} onClick={() => void act('archive', () => adminArticlesApi.archive(article.id), 'Archived.')}>
                  Archive
                </Button>
              )}
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setConfirm({
                    action: 'delete',
                    message: `Delete “${draft.title}”? It disappears for readers and from this list (its history is kept).`,
                  });
                }}
              >
                Delete
              </Button>
            </div>
            {confirm && (
              <div className="confirm-box" role="alertdialog" aria-labelledby="confirm-text">
                <p id="confirm-text">{confirm.message}</p>
                <Button
                  size="sm"
                  variant="danger"
                  loading={busy !== null}
                  onClick={() => {
                    const action = confirm.action;
                    setConfirm(null);
                    if (action === 'delete') void remove(true);
                    else
                      void act(
                        action,
                        () => (action === 'archive' ? adminArticlesApi.archive(article.id, true) : adminArticlesApi.unpublish(article.id, true)),
                        action === 'archive' ? 'Archived.' : 'Unpublished.',
                      );
                  }}
                >
                  Yes, {confirm.action}
                </Button>{' '}
                <Button
                  size="sm"
                  variant="ghost"
                  autoFocus
                  onClick={() => {
                    setConfirm(null);
                  }}
                >
                  Keep it
                </Button>
              </div>
            )}
          </section>

          <section className="side-card" aria-labelledby="revisions-title">
            <h2 id="revisions-title">History</h2>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => {
                adminArticlesApi.revisions(article.id).then(
                  (r) => {
                    setRevisions(r.items);
                  },
                  (err: unknown) => {
                    setNotice({ tone: 'danger', text: errorMessage(err) });
                  },
                );
              }}
            >
              {revisions ? 'Refresh' : 'Show revisions'}
            </Button>{' '}
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                void (async () => {
                  if ((await saved()) === null) return;
                  try {
                    setRevisions((await adminArticlesApi.saveRevision(article.id)).items);
                    setNotice({ tone: 'success', text: 'Revision saved.' });
                  } catch (err) {
                    setNotice({ tone: 'danger', text: errorMessage(err) });
                  }
                })();
              }}
            >
              Save a revision
            </Button>
            {revisions && (
              <ul className="revision-list">
                {revisions.map((r) => (
                  <li key={r.id}>
                    <span>
                      {REVISION_LABEL[r.reason]} · {when(r.createdAt)}
                      {r.createdBy ? ` · ${r.createdBy}` : ''}
                    </span>
                    <Button
                      size="sm"
                      variant="ghost"
                      loading={busy === `restore-${r.id}`}
                      onClick={() => {
                        void (async () => {
                          const version = await saved();
                          if (version === null) return;
                          await act(
                            `restore-${r.id}`,
                            () => adminArticlesApi.restoreRevision(article.id, r.id, version),
                            'Revision restored into the draft. The draft before it is kept in History.',
                          );
                        })();
                      }}
                    >
                      Restore
                    </Button>
                  </li>
                ))}
                {revisions.length === 0 && <li className="muted">No revisions yet.</li>}
              </ul>
            )}
          </section>
        </aside>
      </div>

      {preview && (
        <section className="preview-panel" aria-labelledby="preview-title">
          <div className="preview-panel__bar">
            <h2 id="preview-title">Preview: what readers will see</h2>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => {
                setPreview(null);
              }}
            >
              Close preview
            </Button>
          </div>
          <article className="preview-panel__article">
            <h1>{preview.title}</h1>
            {preview.summary && <p className="muted">{preview.summary}</p>}
            {!preview.locked && <ArticleBody body={preview.body} images={preview.images} articles={preview.articles} />}
          </article>
        </section>
      )}
    </div>
  );
}

export default function AdminArticleEditor() {
  const { id = '' } = useParams();
  const [state, setState] = useState<
    | {
        article: AdminArticle;
        conditions: Condition[];
        key: number;
        flash: Notice | null;
        unsaved: boolean;
      }
    | { error: string }
    | null
  >(null);

  useEffect(() => {
    let current = true;
    Promise.all([adminArticlesApi.get(id), conditionsApi.list()]).then(
      ([a, c]) => {
        if (current)
          setState({
            article: a.article,
            conditions: c.items,
            key: 0,
            flash: null,
            unsaved: false,
          });
      },
      (err: unknown) => {
        if (current)
          setState({
            error: err instanceof ApiRequestError && err.status === 404 ? 'This article doesn’t exist (it may have been deleted).' : errorMessage(err),
          });
      },
    );
    return () => {
      current = false;
    };
  }, [id]);

  if (!state) {
    return (
      <div className="media-empty">
        <Spinner size={22} label="Loading the article" />
      </div>
    );
  }
  if ('error' in state) {
    return (
      <>
        <Alert tone="danger">{state.error}</Alert>
        <Link to="/admin/articles">← Back to articles</Link>
      </>
    );
  }
  return (
    <Editor
      // A reload (their version, a restore, a publish) starts the editor afresh from the server's copy.
      key={`${state.article.id}-${String(state.key)}`}
      initial={state.article}
      conditions={state.conditions}
      flash={state.flash}
      unsaved={state.unsaved}
      onReload={(fresh, flash, unsaved = false) => {
        setState((s) =>
          s && !('error' in s)
            ? {
                ...s,
                article: fresh,
                key: s.key + 1,
                flash: flash ?? null,
                unsaved,
              }
            : s,
        );
      }}
    />
  );
}
