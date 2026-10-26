import { useEffect, useRef, useState, type DragEvent as ReactDragEvent } from 'react';
import { Alert } from '../../components/ui/Alert';
import { Button } from '../../components/ui/Button';
import { Spinner } from '../../components/ui/Spinner';
import { TextField } from '../../components/ui/TextField';
import { apiUrl, ApiRequestError } from '../../services/apiClient';
import { imageProblem, MAX_IMAGE_MB, mediaApi, type MediaItem, type MediaPage } from '../../features/content/api';
import { errorMessage, fieldErrors } from '../../features/auth/errors';
import { useAdminData } from './useAdminData';

const PAGE_SIZE = 24;

type UploadState =
  | { phase: 'waiting' }
  | { phase: 'uploading'; progress: number }
  | { phase: 'processing' }
  | { phase: 'done'; deduplicated: boolean }
  | { phase: 'failed'; message: string };

interface Upload {
  key: string;
  name: string;
  state: UploadState;
}

const isActive = (state: UploadState) => state.phase === 'waiting' || state.phase === 'uploading' || state.phase === 'processing';

const formatBytes = (bytes: number) =>
  bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;

function uploadLabel(state: UploadState): string {
  switch (state.phase) {
    case 'waiting':
      return 'Waiting…';
    case 'uploading':
      return `Uploading ${Math.round(state.progress * 100)}%`;
    case 'processing':
      return 'Optimising: making web sizes and removing camera data…';
    case 'done':
      return state.deduplicated ? 'Already in the library: kept the existing copy.' : 'Added to the library.';
    case 'failed':
      return state.message;
  }
}

/** Errors after which sending the rest of a batch is pointless: signed out, limit reached, busy, disk full. */
const stopsTheBatch = (err: unknown) => err instanceof ApiRequestError && [401, 429, 503, 507].includes(err.status);

function Dropzone({ onFiles, maxMb }: { onFiles: (files: File[]) => void; maxMb: number }) {
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const onDrop = (event: ReactDragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setOver(false);
    if (event.dataTransfer.files.length) onFiles([...event.dataTransfer.files]);
  };
  return (
    <div
      className={`dropzone ${over ? 'dropzone--over' : ''}`}
      onDragOver={(event) => {
        event.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => {
        setOver(false);
      }}
      onDrop={onDrop}
    >
      <p className="dropzone__title">Drop images here</p>
      <p className="muted dropzone__hint">
        JPEG, PNG or WebP, up to {maxMb} MB each. They’re resized for the web and camera details (like GPS location) are removed.
      </p>
      <Button
        variant="secondary"
        onClick={() => {
          input.current?.click();
        }}
      >
        Choose images
      </Button>
      <input
        ref={input}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        multiple
        hidden
        data-testid="media-file-input"
        onChange={(event) => {
          const files = [...(event.target.files ?? [])];
          event.target.value = ''; // choosing the same file again still fires
          if (files.length) onFiles(files);
        }}
      />
    </div>
  );
}

function MediaCard({ item, onSaved, onDeleted }: { item: MediaItem; onSaved: (m: MediaItem) => void; onDeleted: (m: MediaItem) => void }) {
  const [alt, setAlt] = useState(item.altText);
  // What the server has: the card stays correct after a save without reloading the whole page.
  const [savedAlt, setSavedAlt] = useState(item.altText);
  const [altError, setAltError] = useState<string | undefined>();
  const [saving, setSaving] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  // When the confirmation closes, focus goes back to the Delete button instead of being lost.
  const focusDelete = useRef(false);
  const label = item.originalName ?? 'Untitled image';
  const preview = item.variants.find((v) => v.width >= 480) ?? item.variants.at(-1);

  const save = async () => {
    const sent = alt.trim();
    setSaving(true);
    try {
      const { media } = await mediaApi.update(item.id, sent);
      setSavedAlt(media.altText);
      // Only tidy the field if the admin hasn't typed more while it was saving.
      setAlt((current) => (current.trim() === sent ? media.altText : current));
      onSaved(media);
    } catch (err) {
      setAltError(fieldErrors(err)['altText'] ?? errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const closeConfirm = () => {
    focusDelete.current = true;
    setConfirming(false);
  };

  const remove = async () => {
    setDeleting(true);
    try {
      await mediaApi.remove(item.id);
      onDeleted(item);
    } catch (err) {
      setDeleteError(errorMessage(err));
      closeConfirm();
    } finally {
      setDeleting(false);
    }
  };

  return (
    <li className="media-card">
      <div className="media-card__frame" style={item.placeholder && !loaded ? { backgroundImage: `url("${item.placeholder}")` } : undefined}>
        {preview && (
          <img
            src={apiUrl(preview.url)}
            srcSet={item.variants.map((v) => `${apiUrl(v.url)} ${String(v.width)}w`).join(', ')}
            // Matches the grid: one column on phones, otherwise cards of about 15–20rem.
            sizes="(max-width: 600px) calc(100vw - 2rem), (max-width: 860px) 50vw, 320px"
            width={preview.width}
            height={preview.height}
            alt={savedAlt}
            loading="lazy"
            decoding="async"
            onLoad={() => {
              setLoaded(true);
            }}
          />
        )}
      </div>
      <div className="media-card__body">
        <p className="media-card__name" title={label}>
          {label}
        </p>
        <p className="muted media-card__meta">
          {item.width} × {item.height} · {formatBytes(item.sizeBytes)}
          {!savedAlt && <span className="badge badge--warn">Needs alt text</span>}
        </p>
        <TextField
          label="Alt text"
          value={alt}
          maxLength={255}
          error={altError}
          hint="Describe the image for people who can’t see it."
          onChange={(e) => {
            setAlt(e.target.value);
            setAltError(undefined);
          }}
        />
        <div className="media-card__actions">
          {alt.trim() !== savedAlt && (
            <Button size="sm" loading={saving} onClick={() => void save()}>
              Save alt text
            </Button>
          )}
          {confirming ? (
            <span className="confirm">
              <span>Delete this image?</span>
              <Button size="sm" variant="danger" loading={deleting} onClick={() => void remove()}>
                Yes, delete
              </Button>
              <Button size="sm" variant="ghost" autoFocus onClick={closeConfirm}>
                Keep
              </Button>
            </span>
          ) : (
            <Button
              size="sm"
              variant="ghost"
              aria-label={`Delete ${label}`}
              ref={(el) => {
                if (el && focusDelete.current) {
                  focusDelete.current = false;
                  el.focus();
                }
              }}
              onClick={() => {
                setConfirming(true);
                setDeleteError(null);
              }}
            >
              Delete
            </Button>
          )}
        </div>
        {deleteError && (
          <p className="media-card__error" role="alert">
            {deleteError}
          </p>
        )}
      </div>
    </li>
  );
}

export default function AdminMedia() {
  const [page, setPage] = useState(1);
  const [reloadKey, setReloadKey] = useState(0);
  const result = useAdminData(() => mediaApi.list(page, PAGE_SIZE), [page, reloadKey]);
  // The last page that loaded stays on screen while a reload runs, so cards (and unsaved alt text) stay put.
  const [shown, setShown] = useState<MediaPage | null>(null);
  if (result.status === 'ready' && result.data !== shown) setShown(result.data);
  const data = result.status === 'ready' ? result.data : shown;
  // Deleting the last image on a later page leaves that page empty: step back to the last real page.
  if (result.status === 'ready' && result.data.items.length === 0 && result.data.total > 0 && page > 1) {
    setPage(Math.max(1, Math.ceil(result.data.total / result.data.pageSize)));
  }
  const maxMb = data?.limits?.maxImageMb ?? MAX_IMAGE_MB;
  const pages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;

  const [uploads, setUploads] = useState<Upload[]>([]);
  const busy = uploads.some((u) => isActive(u.state));
  const pending = useRef<{ key: string; file: File }[]>([]);
  const draining = useRef(false);
  const nextKey = useRef(0);

  const [notice, setNotice] = useState<{ tone: 'success' | 'danger'; text: string } | null>(null);
  const noticeRef = useRef<HTMLDivElement>(null);
  // Always in the page, so screen readers hear every result (a region that appears with its text often isn't read).
  const [announcement, setAnnouncement] = useState('');

  const reload = () => {
    setReloadKey((k) => k + 1);
  };
  const setState = (key: string, state: UploadState) => {
    setUploads((list) => list.map((u) => (u.key === key ? { ...u, state } : u)));
  };

  // A file dropped outside the drop area would make the browser open it and leave this page mid-upload.
  useEffect(() => {
    const keepFiles = (event: DragEvent) => {
      if (event.dataTransfer?.types.includes('Files')) event.preventDefault();
    };
    window.addEventListener('dragover', keepFiles);
    window.addEventListener('drop', keepFiles);
    return () => {
      window.removeEventListener('dragover', keepFiles);
      window.removeEventListener('drop', keepFiles);
    };
  }, []);

  // Closing or reloading the tab mid-upload asks first.
  useEffect(() => {
    if (!busy) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };
    window.addEventListener('beforeunload', warn);
    return () => {
      window.removeEventListener('beforeunload', warn);
    };
  }, [busy]);

  /** Upload queued files one at a time (the server processes one at a time anyway). */
  const drain = async () => {
    draining.current = true;
    let added = 0;
    let job = pending.current.shift();
    while (job) {
      const { key, file } = job;
      setState(key, { phase: 'uploading', progress: 0 });
      try {
        const { deduplicated } = await mediaApi.uploadImage(file, '', {
          onProgress: (fraction) => {
            setState(key, fraction >= 1 ? { phase: 'processing' } : { phase: 'uploading', progress: fraction });
          },
        });
        setState(key, { phase: 'done', deduplicated });
        setAnnouncement(`${file.name}: ${deduplicated ? 'already in the library' : 'added to the library'}.`);
        added += 1;
      } catch (err) {
        const message = errorMessage(err);
        setState(key, { phase: 'failed', message });
        setAnnouncement(`${file.name}: ${message}`);
        if (stopsTheBatch(err)) {
          for (const rest of pending.current.splice(0)) setState(rest.key, { phase: 'failed', message: `Not sent. ${message}` });
        }
      }
      job = pending.current.shift();
    }
    draining.current = false;
    if (added) {
      setPage(1);
      reload();
    }
  };

  /** Check every file first; good ones join the queue (a second drop while uploading adds to it). */
  const addFiles = (files: File[]) => {
    setNotice(null);
    const entries = files.map((file) => {
      nextKey.current += 1;
      const problem = imageProblem(file, maxMb);
      return {
        file,
        upload: {
          key: `u${String(nextKey.current)}`,
          name: file.name,
          state: problem ? ({ phase: 'failed', message: problem } as const) : ({ phase: 'waiting' } as const),
        },
      };
    });
    const startFresh = !draining.current;
    setUploads((list) => [...(startFresh ? [] : list), ...entries.map((e) => e.upload)]);
    pending.current.push(...entries.filter((e) => e.upload.state.phase === 'waiting').map((e) => ({ key: e.upload.key, file: e.file })));
    if (!draining.current) void drain();
  };

  const say = (tone: 'success' | 'danger', text: string, focus = false) => {
    setNotice({ tone, text });
    setAnnouncement(text);
    if (focus) {
      requestAnimationFrame(() => {
        noticeRef.current?.focus();
      });
    }
  };

  return (
    <>
      <header className="admin__header">
        <h1>Media library</h1>
        <p className="muted">Images for article thumbnails, condition pages and the articles themselves.</p>
      </header>

      <Dropzone maxMb={maxMb} onFiles={addFiles} />

      {uploads.length > 0 && (
        <ul className="upload-list" aria-label="Uploads">
          {uploads.map((u) => (
            <li key={u.key} className={`upload-list__item upload-list__item--${u.state.phase}`}>
              <span className="upload-list__name">{u.name}</span>
              <span className="upload-list__status">{uploadLabel(u.state)}</span>
              {u.state.phase === 'uploading' && <progress max={1} value={u.state.progress} aria-label={`Uploading ${u.name}`} />}
            </li>
          ))}
        </ul>
      )}

      <div className="visually-hidden" aria-live="polite" data-testid="media-announcer">
        {announcement}
      </div>
      {/* Focus lands here after a delete, so keyboard users aren't dropped at the top of the page. */}
      <div ref={noticeRef} tabIndex={-1} className="media-notice">
        {notice && <Alert tone={notice.tone}>{notice.text}</Alert>}
      </div>
      {result.status === 'error' && <Alert tone="danger">{result.message}</Alert>}
      {!data && result.status === 'loading' && (
        <div className="media-empty">
          <Spinner size={22} label="Loading images" />
        </div>
      )}
      {data?.total === 0 && <p className="media-empty muted">No images yet. Drop your first one above.</p>}
      {data && data.items.length > 0 && (
        <ul className="media-grid" aria-label="Images" aria-busy={result.status === 'loading'}>
          {data.items.map((item) => (
            <MediaCard
              key={item.id}
              item={item}
              onSaved={() => {
                say('success', 'Alt text saved.');
              }}
              onDeleted={(m) => {
                say('success', `“${m.originalName ?? 'The image'}” was deleted.`, true);
                reload();
              }}
            />
          ))}
        </ul>
      )}
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
