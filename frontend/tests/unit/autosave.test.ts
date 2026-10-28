import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { ApiRequestError } from '../../src/services/apiClient';
import { readCrashCopy, saveStatusText, useAutosave } from '../../src/features/editor/useAutosave';
import type { ArticleDraft } from '../../src/features/articles/types';
import type { SaveResult } from '../../src/features/articles/api';

const draft = (title: string): ArticleDraft => ({
  title,
  slug: '',
  summary: '',
  conditionId: '0190a1b2-c3d4-7000-8000-00000000c001',
  accessLevel: 'members',
  lang: 'en',
  accent: 'saffron',
  cover: { mediaId: null, alt: '', focalX: 50, focalY: 50 },
  relatedIds: [],
  seoTitle: '',
  seoDescription: '',
  body: { type: 'doc', content: [] },
});

const ok = (draftVersion: number): SaveResult => ({ draftVersion, savedAt: '2026-10-28T06:30:00Z', hasUnpublishedChanges: false });

function setup(save: (id: string, version: number, d: ArticleDraft) => Promise<SaveResult>) {
  return renderHook(() => useAutosave({ articleId: 'a1', initialVersion: 1, initialSavedAt: '2026-10-28T06:00:00Z', save }));
}

beforeEach(() => {
  vi.useFakeTimers();
  localStorage.clear();
});
afterEach(() => {
  vi.useRealTimers();
});

describe('autosave', () => {
  it('saves once, 3 s after the last change, and carries the new version into the next save', async () => {
    const save = vi.fn((_id: string, version: number) => Promise.resolve(ok(version + 1)));
    const { result } = setup(save);
    act(() => {
      result.current.schedule(draft('A'));
      result.current.schedule(draft('Ab'));
      result.current.schedule(draft('Abc'));
    });
    expect(result.current.state.kind).toBe('dirty');
    expect(readCrashCopy('a1')?.draft.title).toBe('Abc'); // crash copy kept at once
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2_999);
    });
    expect(save).not.toHaveBeenCalled();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(save).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenLastCalledWith('a1', 1, expect.objectContaining({ title: 'Abc' }));
    expect(result.current.state.kind).toBe('saved');
    expect(readCrashCopy('a1')).toBeNull(); // cleared once the server has it

    act(() => {
      result.current.schedule(draft('Abcd'));
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3_000);
    });
    expect(save).toHaveBeenLastCalledWith('a1', 2, expect.objectContaining({ title: 'Abcd' }));
  });

  it('stops on someone else’s newer save and says who', async () => {
    const save = vi.fn(() => Promise.reject(new ApiRequestError(409, 'Someone saved this article after you opened it (Guru).', 'STALE_VERSION', { draftVersion: 5, savedBy: 'Guru' })));
    const { result } = setup(save);
    act(() => {
      result.current.schedule(draft('Mine'));
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3_000);
    });
    expect(result.current.state).toMatchObject({ kind: 'conflict', savedBy: 'Guru' });
    act(() => {
      result.current.schedule(draft('More'));
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_000);
    });
    expect(save).toHaveBeenCalledTimes(1); // nothing overwritten
    expect(readCrashCopy('a1')?.draft.title).toBe('More'); // edits made after the conflict are still kept in this browser
    expect(result.current.state.kind).toBe('conflict');
  });

  it('stops when the article was deleted', async () => {
    const save = vi.fn(() => Promise.reject(new ApiRequestError(410, 'This article was deleted, so it can’t be saved.', 'ARTICLE_DELETED')));
    const { result } = setup(save);
    act(() => {
      result.current.schedule(draft('X'));
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3_000);
    });
    expect(result.current.state.kind).toBe('deleted');
    expect(saveStatusText(result.current.state)).toMatch(/was deleted/);
  });

  it('retries network failures with growing pauses, then saves', async () => {
    const save = vi
      .fn<(id: string, version: number, d: ArticleDraft) => Promise<SaveResult>>()
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValueOnce(ok(2));
    const { result } = setup(save);
    act(() => {
      result.current.schedule(draft('X'));
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3_000);
    });
    expect(result.current.state.kind).toBe('retrying');
    expect(saveStatusText(result.current.state)).toMatch(/Trying again in 2 s/);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2_000);
    });
    expect(saveStatusText(result.current.state)).toMatch(/Trying again in 4 s/);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(4_000);
    });
    expect(save).toHaveBeenCalledTimes(3);
    expect(result.current.state.kind).toBe('saved');
  });

  it('does not resend a draft the server refused, but saves the next edit', async () => {
    const save = vi
      .fn<(id: string, version: number, d: ArticleDraft) => Promise<SaveResult>>()
      .mockRejectedValueOnce(new ApiRequestError(400, 'The article body has parts that aren’t allowed.', 'INVALID_DOCUMENT'))
      .mockResolvedValueOnce(ok(2));
    const { result } = setup(save);
    act(() => {
      result.current.schedule(draft('Bad'));
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(30_000);
    });
    expect(save).toHaveBeenCalledTimes(1);
    expect(result.current.state.kind).toBe('failed');
    act(() => {
      result.current.schedule(draft('Fixed'));
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3_000);
    });
    expect(save).toHaveBeenCalledTimes(2);
    expect(result.current.state.kind).toBe('saved');
  });

  it('flush returns null when the latest changes could not be saved, so publishing stops', async () => {
    const save = vi.fn(() => Promise.reject(new ApiRequestError(503, 'Service unavailable', 'UNAVAILABLE')));
    const { result } = setup(save);
    act(() => {
      result.current.schedule(draft('Offline'));
    });
    let version: number | null = 0;
    await act(async () => {
      version = await result.current.flush();
    });
    expect(version).toBeNull();
    expect(result.current.state.kind).toBe('retrying');
  });

  it('flush saves at once and returns the latest version (used before publishing)', async () => {
    const save = vi.fn((_id: string, version: number) => Promise.resolve(ok(version + 1)));
    const { result } = setup(save);
    act(() => {
      result.current.schedule(draft('Now'));
    });
    let version: number | null = 0;
    await act(async () => {
      version = await result.current.flush();
    });
    expect(version).toBe(2);
    expect(save).toHaveBeenCalledTimes(1);
  });

  it('waits as long as the server asks when it is rate-limited (Retry-After)', async () => {
    const save = vi
      .fn<(id: string, version: number, d: ArticleDraft) => Promise<SaveResult>>()
      .mockRejectedValueOnce(new ApiRequestError(429, 'Too many saves.', 'RATE_LIMITED', undefined, 10))
      .mockResolvedValueOnce(ok(2));
    const { result } = setup(save);
    act(() => {
      result.current.schedule(draft('X'));
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3_000);
    });
    expect(saveStatusText(result.current.state)).toMatch(/Trying again in 10 s/);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(9_999);
    });
    expect(save).toHaveBeenCalledTimes(1);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(save).toHaveBeenCalledTimes(2);
    expect(result.current.state.kind).toBe('saved');
  });

  it('reset starts again from a new version and drops anything pending', async () => {
    const save = vi.fn((_id: string, version: number) => Promise.resolve(ok(version + 1)));
    const { result } = setup(save);
    act(() => {
      result.current.schedule(draft('Old'));
      result.current.reset(7, '2026-10-28T07:00:00Z');
    });
    expect(result.current.state).toEqual({ kind: 'saved', at: '2026-10-28T07:00:00Z' });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5_000);
    });
    expect(save).not.toHaveBeenCalled();
    act(() => {
      result.current.schedule(draft('New'));
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3_000);
    });
    expect(save).toHaveBeenLastCalledWith('a1', 7, expect.objectContaining({ title: 'New' }));
  });

  it('warns before leaving the page only while something is unsaved', async () => {
    const save = vi.fn((_id: string, version: number) => Promise.resolve(ok(version + 1)));
    const { result } = setup(save);
    const leave = () => {
      const event = new Event('beforeunload', { cancelable: true });
      window.dispatchEvent(event);
      return event.defaultPrevented;
    };
    expect(leave()).toBe(false);
    act(() => {
      result.current.schedule(draft('X'));
    });
    expect(leave()).toBe(true);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3_000);
    });
    expect(leave()).toBe(false);
  });
});

describe('crash copy and status text', () => {
  it('ignores a damaged or incomplete copy in this browser', () => {
    localStorage.setItem('hm-draft-a1', '{not json');
    expect(readCrashCopy('a1')).toBeNull();
    localStorage.setItem('hm-draft-a1', JSON.stringify({ draft: draft('X') })); // no version or time
    expect(readCrashCopy('a1')).toBeNull();
    localStorage.setItem('hm-draft-a1', JSON.stringify({ draft: draft('X'), basedOnVersion: 3, at: '2026-10-28T06:00:00Z' }));
    expect(readCrashCopy('a1')).toMatchObject({ basedOnVersion: 3 });
    expect(readCrashCopy('other')).toBeNull();
  });

  it('describes every save state in plain words', () => {
    expect(saveStatusText({ kind: 'saved', at: '2026-10-28T06:30:00Z' })).toMatch(/^Saved · /);
    expect(saveStatusText({ kind: 'dirty' })).toBe('Unsaved changes…');
    expect(saveStatusText({ kind: 'saving' })).toBe('Saving…');
    expect(saveStatusText({ kind: 'failed', message: 'Not allowed.' })).toBe('Not allowed.');
    expect(saveStatusText({ kind: 'conflict', message: 'Guru saved.', savedBy: 'Guru' })).toBe('Guru saved.');
  });
});
