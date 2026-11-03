// The clock behind typed text: types, holds, erases, moves to the next item, and loops. One timer per step.
// Visitors who prefer reduced motion get the first item complete, and it stays that way. A prerendered page
// can't know that preference, so it (and its hydration) draws the moving version; the browser then corrects it.
import { useEffect, useState, useSyncExternalStore } from 'react';

export interface TypedTiming {
  typeMs: number;
  eraseMs: number;
  holdMs: number;
  gapMs: number;
}

type Phase = 'hold' | 'erase' | 'type';

const REDUCED_MOTION = '(prefers-reduced-motion: reduce)';
const prefersStill = () => window.matchMedia(REDUCED_MOTION).matches;
const subscribeToMotion = (onChange: () => void) => {
  const query = window.matchMedia(REDUCED_MOTION);
  query.addEventListener('change', onChange);
  return () => {
    query.removeEventListener('change', onChange);
  };
};

/**
 * Splits text into what a reader sees as one letter. Hindi and Sanskrit letters are built from several
 * code units (ग + ् + ध), so cutting between those would flash broken glyphs while typing.
 */
export function graphemes(text: string): string[] {
  if (typeof Intl.Segmenter !== 'function') return Array.from(text);
  return Array.from(new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(text), (s) => s.segment);
}

interface Options {
  /** Begin blank and type the first item, instead of showing it complete and holding. */
  startEmpty?: boolean;
  /** Nothing moves while false: used to wait until the text has scrolled into view. */
  active?: boolean;
}

/** `lengths` holds how many steps each item has. */
export function useTypedCycle(lengths: readonly number[], timing: TypedTiming, { startEmpty = false, active = true }: Options = {}) {
  const still = useSyncExternalStore(subscribeToMotion, prefersStill, () => false);
  const [paused, setPaused] = useState(false);
  const [state, setState] = useState<{ index: number; typed: number; phase: Phase }>(() =>
    startEmpty && !still ? { index: 0, typed: 0, phase: 'type' } : { index: 0, typed: lengths.at(0) ?? 0, phase: 'hold' },
  );
  const total = lengths.at(state.index) ?? 0;
  const count = lengths.length;
  const { typeMs, eraseMs, holdMs, gapMs } = timing;

  useEffect(() => {
    if (still || paused || !active) return undefined;
    const { index, typed, phase } = state;
    let delay = typeMs;
    let next = state;
    if (phase === 'hold') {
      delay = holdMs;
      next = { index, typed, phase: 'erase' };
    } else if (phase === 'erase' && typed > 0) {
      delay = eraseMs;
      next = { index, typed: typed - 1, phase };
    } else if (phase === 'erase') {
      delay = gapMs;
      next = { index: (index + 1) % count, typed: 0, phase: 'type' };
    } else if (typed < total) {
      next = { index, typed: typed + 1, phase };
    } else {
      delay = 0;
      next = { index, typed, phase: 'hold' };
    }
    const timer = setTimeout(() => {
      setState(next);
    }, delay);
    return () => {
      clearTimeout(timer);
    };
  }, [state, paused, still, active, count, total, typeMs, eraseMs, holdMs, gapMs]);

  return {
    // Still: always the first item, complete (it may have started blank before the preference was known).
    index: still ? 0 : state.index,
    typed: still ? (lengths.at(0) ?? 0) : state.typed,
    still,
    paused,
    togglePaused: () => {
      setPaused((p) => !p);
    },
  };
}
