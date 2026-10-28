// Autosave for the article editor: 3 s after the last change the whole draft is saved with the draftVersion
// it was based on. Nothing is ever overwritten silently: someone else's newer save (409) stops autosave and
// is shown; a deleted article (410) stops it too. Network failures retry with growing pauses, and a crash
// copy stays in this browser until the server has the change.
import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiRequestError } from '../../services/apiClient';
import { errorMessage } from '../auth/errors';
import { adminArticlesApi, type SaveResult } from '../articles/api';
import type { ArticleDraft } from '../articles/types';

export type SaveState =
  | { kind: 'saved'; at: string }
  | { kind: 'dirty' }
  | { kind: 'saving' }
  | { kind: 'retrying'; message: string }
  | { kind: 'failed'; message: string }
  | { kind: 'conflict'; message: string; savedBy: string | null }
  | { kind: 'deleted'; message: string };

export interface CrashCopy {
  draft: ArticleDraft;
  basedOnVersion: number;
  at: string;
}

const crashKey = (articleId: string) => `hm-draft-${articleId}`;

export function readCrashCopy(articleId: string): CrashCopy | null {
  try {
    const raw = localStorage.getItem(crashKey(articleId));
    if (!raw) return null;
    const copy = JSON.parse(raw) as Partial<CrashCopy>;
    return copy.draft && typeof copy.basedOnVersion === 'number' && typeof copy.at === 'string' ? (copy as CrashCopy) : null;
  } catch {
    return null;
  }
}

export function clearCrashCopy(articleId: string) {
  try {
    localStorage.removeItem(crashKey(articleId));
  } catch {
    // Storage blocked: nothing was kept.
  }
}

function writeCrashCopy(articleId: string, copy: CrashCopy) {
  try {
    localStorage.setItem(crashKey(articleId), JSON.stringify(copy));
  } catch {
    // Storage full or blocked: the server save still runs.
  }
}

export interface AutosaveOptions {
  articleId: string;
  initialVersion: number;
  initialSavedAt: string;
  delayMs?: number;
  save?: (id: string, version: number, draft: ArticleDraft) => Promise<SaveResult>;
  onSaved?: (result: SaveResult) => void;
}

const BACKOFF_MS = [2_000, 4_000, 8_000, 16_000, 30_000];

export function useAutosave({ articleId, initialVersion, initialSavedAt, delayMs = 3_000, save = adminArticlesApi.saveDraft, onSaved }: AutosaveOptions) {
  const [state, setState] = useState<SaveState>({ kind: 'saved', at: initialSavedAt });
  const version = useRef(initialVersion);
  const pending = useRef<ArticleDraft | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const running = useRef<Promise<void> | null>(null);
  const stopped = useRef(false);
  const attempt = useRef(0);
  // A draft the server refused (400): wait for the next edit instead of resending the same thing.
  const refused = useRef(false);
  const onSavedRef = useRef(onSaved);
  const runRef = useRef<() => Promise<void>>(() => Promise.resolve());
  useEffect(() => {
    onSavedRef.current = onSaved;
  });

  const clearTimer = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  };
  const run = useCallback(async (): Promise<void> => {
    // Read through a function so TypeScript doesn't assume the refs can't change during an await.
    const canContinue = () => pending.current !== null && !stopped.current && !refused.current && timer.current === null;
    // One save at a time; when it finishes, anything typed meanwhile is saved next.
    for (;;) {
      if (running.current) {
        await running.current;
        if (!canContinue()) return;
        continue;
      }
      const draft = pending.current;
      if (!draft || stopped.current) return;
      pending.current = null;
      setState({ kind: 'saving' });
      const job = (async () => {
      try {
        const result = await save(articleId, version.current, draft);
        version.current = result.draftVersion;
        attempt.current = 0;
        if (!pending.current) {
          clearCrashCopy(articleId);
          setState({ kind: 'saved', at: result.savedAt });
        }
        onSavedRef.current?.(result);
      } catch (err) {
        // Keep the unsaved draft for a retry unless something newer arrived meanwhile.
        pending.current ??= draft;
        if (err instanceof ApiRequestError && err.code === 'STALE_VERSION') {
          stopped.current = true;
          const savedBy = (err.details as { savedBy?: string | null } | undefined)?.savedBy ?? null;
          setState({ kind: 'conflict', message: err.message, savedBy });
        } else if (err instanceof ApiRequestError && err.status === 410) {
          stopped.current = true;
          setState({ kind: 'deleted', message: err.message });
        } else if (err instanceof ApiRequestError && err.status >= 400 && err.status < 500 && err.status !== 429 && err.status !== 408) {
          // The draft itself was refused (e.g. something not allowed in the body): retrying won't help.
          refused.current = true;
          setState({ kind: 'failed', message: errorMessage(err) });
        } else {
          const wait = err instanceof ApiRequestError && err.retryAfter ? err.retryAfter * 1000 : (BACKOFF_MS[Math.min(attempt.current, BACKOFF_MS.length - 1)] ?? 30_000);
          attempt.current += 1;
          setState({ kind: 'retrying', message: `Not saved: ${errorMessage(err)} Trying again in ${String(Math.round(wait / 1000))} s.` });
          clearTimer();
          timer.current = setTimeout(() => {
            timer.current = null;
            void runRef.current();
          }, wait);
        }
      }
    })();
      running.current = job;
      try {
        await job;
      } finally {
        running.current = null;
      }
      if (!canContinue()) return;
    }
  }, [articleId, save]);
  useEffect(() => {
    runRef.current = run;
  }, [run]);

  /** A change was made: keep a crash copy now, save after the pause. */
  const schedule = useCallback(
    (draft: ArticleDraft) => {
      pending.current = draft;
      writeCrashCopy(articleId, { draft, basedOnVersion: version.current, at: new Date().toISOString() });
      // After a conflict or a delete the text is still kept in this browser, but never sent.
      if (stopped.current) return;
      refused.current = false;
      setState({ kind: 'dirty' });
      clearTimer();
      timer.current = setTimeout(() => {
        timer.current = null;
        void run();
      }, delayMs);
    },
    [articleId, delayMs, run],
  );

  /**
   * Save anything pending right now (before publishing). Resolves with the draftVersion the server has
   * everything under, or null when the latest changes couldn't be saved (callers must stop there).
   */
  const flush = useCallback(async (): Promise<number | null> => {
    clearTimer();
    await run();
    return pending.current === null && !stopped.current ? version.current : null;
  }, [run]);

  /** After a reload, restore or publish elsewhere: start again from this version. */
  const reset = useCallback((nextVersion: number, savedAt: string) => {
    clearTimer();
    pending.current = null;
    stopped.current = false;
    refused.current = false;
    attempt.current = 0;
    version.current = nextVersion;
    setState({ kind: 'saved', at: savedAt });
  }, []);

  // Leaving with unsaved work asks first.
  const unsaved = state.kind !== 'saved';
  useEffect(() => {
    if (!unsaved) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };
    window.addEventListener('beforeunload', warn);
    return () => {
      window.removeEventListener('beforeunload', warn);
    };
  }, [unsaved]);

  useEffect(() => clearTimer, []);

  return { state, schedule, flush, reset, version };
}

/** "Saved · 12:04", "Saving…", or what went wrong, for the status line. */
export function saveStatusText(state: SaveState): string {
  switch (state.kind) {
    case 'saved':
      return `Saved · ${new Date(state.at).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' })}`;
    case 'dirty':
      return 'Unsaved changes…';
    case 'saving':
      return 'Saving…';
    case 'retrying':
    case 'failed':
    case 'conflict':
    case 'deleted':
      return state.message;
  }
}
