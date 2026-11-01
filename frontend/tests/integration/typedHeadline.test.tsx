// The hero's typed headline: types, holds, erases and moves on; can be paused; stands still for reduced
// motion; and keeps one steady heading for screen readers.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { TypedHeadline, type Slogan } from '../../src/components/motion/TypedHeadline';

const SLOGANS: readonly [Slogan, ...Slogan[]] = [
  { text: 'Ancient wisdom for', accent: 'modern ease' },
  { text: 'Live in tune with', accent: 'every season' },
];

const shown = () => [...screen.getByTestId('typed-live').querySelectorAll('.typed__shown')].map((n) => n.textContent).join(' ').trim();
// In small steps: each step of the animation schedules the next when React re-renders.
const advance = (ms: number) => {
  for (let t = 0; t < ms; t += 5) {
    act(() => {
      vi.advanceTimersByTime(5);
    });
  }
};

afterEach(() => {
  vi.useRealTimers();
});

describe('typed headline', () => {
  it('starts complete, then erases and types the next slogan, and loops', () => {
    vi.useFakeTimers();
    render(<TypedHeadline slogans={SLOGANS} />);
    expect(shown()).toBe('Ancient wisdom for modern ease');
    advance(2_800 + 800);
    expect(shown().length).toBeLessThan(30);
    advance(3_000);
    expect(shown()).toBe('Live in tune with every season');
    advance(5_400);
    expect(shown()).toBe('Ancient wisdom for modern ease');
  });

  it('types letter by letter', () => {
    vi.useFakeTimers();
    render(<TypedHeadline slogans={SLOGANS} />);
    advance(2_800 + 28 * 30 + 400 + 55 * 6);
    expect(shown()).toMatch(/^Liv?e?/);
    expect(shown().length).toBeLessThan(10);
  });

  it('keeps one steady heading for screen readers while it moves', () => {
    vi.useFakeTimers();
    render(<TypedHeadline slogans={SLOGANS} />);
    const name = 'Ancient wisdom for modern ease';
    expect(screen.getByRole('heading', { level: 1, name })).toBeInTheDocument();
    advance(4_000);
    expect(screen.getByRole('heading', { level: 1, name })).toBeInTheDocument();
  });

  it('reserves room for every slogan, so the page below never moves', () => {
    const { container } = render(<TypedHeadline slogans={SLOGANS} />);
    expect(container.querySelectorAll('.typed__line--ghost')).toHaveLength(2);
    expect(container.querySelector('.typed__line--ghost')?.textContent).toBe('Ancient wisdom for modern ease');
  });

  it('can be paused and played again', () => {
    vi.useFakeTimers();
    render(<TypedHeadline slogans={SLOGANS} />);
    const button = screen.getByRole('button', { name: 'Pause the headline animation' });
    fireEvent.click(button);
    advance(20_000);
    expect(shown()).toBe('Ancient wisdom for modern ease');
    fireEvent.click(screen.getByRole('button', { name: 'Play the headline animation' }));
    advance(3_500);
    expect(shown().length).toBeLessThan(30);
  });

  it('stands still with no button when the visitor prefers reduced motion', () => {
    vi.useFakeTimers();
    vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() })));
    render(<TypedHeadline slogans={SLOGANS} />);
    expect(screen.queryByRole('button')).toBeNull();
    advance(20_000);
    expect(shown()).toBe('Ancient wisdom for modern ease');
  });
});
