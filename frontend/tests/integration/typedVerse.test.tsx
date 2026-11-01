// The home page's typed verse: Sanskrit first, then transliteration, then meaning; holds, moves to the next
// verse; waits until it is on screen; can be paused; stands still for reduced motion.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { TypedVerse, type VerseLines } from '../../src/components/motion/TypedVerse';

const VERSES: readonly [VerseLines, ...VerseLines[]] = [
  { sanskrit: 'योगश्चित्तवृत्तिनिरोधः', transliteration: 'yogaś citta-vṛtti-nirodhaḥ', meaning: 'Yoga settles the mind. (Yoga Sūtra 1.2)' },
  { sanskrit: 'स्थिरसुखमासनम्', transliteration: 'sthira-sukham āsanam', meaning: 'Steady and at ease. (Yoga Sūtra 2.46)' },
];

const shown = () => [...screen.getByTestId('typed-verse-live').querySelectorAll('.typed__shown')].map((n) => n.textContent);
const advance = (ms: number) => {
  for (let t = 0; t < ms; t += 5) {
    act(() => {
      vi.advanceTimersByTime(5);
    });
  }
};
const advanceUntil = (check: () => boolean) => {
  for (let t = 0; t < 30_000 && !check(); t += 5) {
    act(() => {
      vi.advanceTimersByTime(5);
    });
  }
};
const full = ({ sanskrit, transliteration, meaning }: VerseLines) => [sanskrit, transliteration, meaning];

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('typed verse', () => {
  it('types the Sanskrit first, then the transliteration, then the meaning', () => {
    vi.useFakeTimers();
    render(<TypedVerse verses={VERSES} />);
    expect(shown()).toEqual(['', '', '']);
    advanceUntil(() => (shown()[0] ?? '').length > 3);
    expect(shown()[1]).toBe('');
    advanceUntil(() => shown()[0] === VERSES[0].sanskrit);
    expect(shown()[2]).toBe('');
    advanceUntil(() => shown()[2] === VERSES[0].meaning);
    expect(shown()).toEqual(full(VERSES[0]));
  });

  it('holds the whole verse long enough to read, then moves to the next and loops', () => {
    vi.useFakeTimers();
    render(<TypedVerse verses={VERSES} />);
    advanceUntil(() => shown()[2] === VERSES[0].meaning);
    advance(5_000);
    expect(shown()).toEqual(full(VERSES[0]));
    advanceUntil(() => shown()[2] === (VERSES[1]?.meaning ?? ''));
    expect(shown()).toEqual(full(VERSES[1] ?? VERSES[0]));
    advanceUntil(() => shown()[2] === VERSES[0].meaning);
    expect(shown()).toEqual(full(VERSES[0]));
  });

  it('never shows a broken letter: each step ends on a whole Sanskrit letter', () => {
    vi.useFakeTimers();
    render(<TypedVerse verses={VERSES} />);
    const seen = new Set<string>();
    for (let t = 0; t < 1_500; t += 5) {
      act(() => {
        vi.advanceTimersByTime(5);
      });
      seen.add(shown()[0] ?? '');
    }
    expect(seen.size).toBeGreaterThan(5);
    for (const step of seen) expect(step).not.toMatch(/^\p{M}/u);
    const letters = [...seen].sort((a, b) => a.length - b.length);
    for (const step of letters) expect(VERSES[0].sanskrit.startsWith(step)).toBe(true);
  });

  it('waits until it has scrolled into view', () => {
    vi.useFakeTimers();
    const observers: IntersectionObserverCallback[] = [];
    vi.stubGlobal(
      'IntersectionObserver',
      class {
        constructor(callback: IntersectionObserverCallback) {
          observers.push(callback);
        }
        observe = vi.fn();
        disconnect = vi.fn();
      },
    );
    render(<TypedVerse verses={VERSES} />);
    advance(2_000);
    expect(shown()).toEqual(['', '', '']);
    act(() => {
      observers.at(-1)?.([{ isIntersecting: true } as IntersectionObserverEntry], {} as IntersectionObserver);
    });
    advance(300);
    expect((shown()[0] ?? '').length).toBeGreaterThan(0);
  });

  it('keeps the first verse steady for screen readers, and reserves room for every verse', () => {
    vi.useFakeTimers();
    const { container } = render(<TypedVerse verses={VERSES} />);
    advance(1_000);
    expect(container.querySelector('.visually-hidden')?.textContent).toContain(VERSES[0].meaning);
    expect(screen.getByTestId('typed-verse-live').closest('[aria-hidden="true"]')).not.toBeNull();
    expect(container.querySelectorAll('.typed__line--ghost')).toHaveLength(2);
  });

  it('can be paused and played again', () => {
    vi.useFakeTimers();
    render(<TypedVerse verses={VERSES} />);
    advance(300);
    fireEvent.click(screen.getByRole('button', { name: 'Pause the verse animation' }));
    const at = shown();
    advance(5_000);
    expect(shown()).toEqual(at);
    fireEvent.click(screen.getByRole('button', { name: 'Play the verse animation' }));
    advance(500);
    expect(shown()).not.toEqual(at);
  });

  it('stands complete, with no button, when the visitor prefers reduced motion', () => {
    vi.useFakeTimers();
    vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() })));
    render(<TypedVerse verses={VERSES} />);
    expect(shown()).toEqual(full(VERSES[0]));
    expect(screen.queryByRole('button')).toBeNull();
    advance(20_000);
    expect(shown()).toEqual(full(VERSES[0]));
  });
});
