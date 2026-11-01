// Typed text must never cut a Hindi or Sanskrit letter in two.
import { describe, expect, it, vi } from 'vitest';
import { graphemes } from '../../src/components/motion/useTypedCycle';
import { VERSES } from '../../src/pages/dashboard/wisdom';

describe('graphemes', () => {
  it('keeps every vowel sign and virama with its letter, in every verse', () => {
    for (const verse of VERSES) {
      const parts = graphemes(verse.sanskrit);
      expect(parts.join('')).toBe(verse.sanskrit);
      for (const part of parts) expect(part).not.toMatch(/^\p{M}/u);
    }
  });

  it('keeps a transliteration mark with its letter, even when it is a separate code point', () => {
    expect(graphemes('ṛa')).toEqual(['ṛ', 'a']);
  });

  it('still returns the whole text where the browser has no Intl.Segmenter', () => {
    vi.stubGlobal('Intl', { ...Intl, Segmenter: undefined });
    expect(graphemes('yoga').join('')).toBe('yoga');
    vi.unstubAllGlobals();
  });
});
