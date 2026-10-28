// Readability guard: every theme's text/background pairs must meet WCAG 2.2 contrast (AA: 4.5:1 for normal
// text, 3:1 for large text and UI parts). Reads the real tokens from src/styles/tokens.css.
import { describe, expect, it } from 'vitest';
import { THEMES } from '../../src/theme/themes';
// The real token file, as text (Vite's ?raw import), so the test checks exactly what ships.
import css from '../../src/styles/tokens.css?raw';

function themeTokens(id: string): Record<string, string> {
  const block = new RegExp(`\\[data-theme='${id}'\\] \\{([^}]*)\\}`).exec(css)?.[1];
  if (!block) throw new Error(`No token block for theme ${id}`);
  return Object.fromEntries([...block.matchAll(/--([\w-]+):\s*(#[0-9a-fA-F]{6})/g)].map((m) => [m[1] ?? '', m[2] ?? '']));
}

const luminance = (hex: string) => {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

const contrast = (a: string, b: string) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
};

// [foreground, background, minimum ratio, what it is]
const PAIRS: [string, string, number, string][] = [
  ['text', 'bg', 7, 'body text on the page'],
  ['text', 'surface', 7, 'body text on cards'],
  ['text-muted', 'bg', 4.5, 'secondary text'],
  ['text-muted', 'surface', 4.5, 'secondary text on cards'],
  ['text-soft', 'surface', 3, 'small labels (uppercase, bold)'],
  ['primary', 'bg', 4.5, 'links on the page'],
  ['primary', 'surface', 4.5, 'links on cards'],
  ['primary-contrast', 'primary', 4.5, 'primary button text'],
  ['primary-contrast', 'primary-hover', 4.5, 'primary button text on hover'],
  ['danger', 'danger-bg', 4.5, 'error alerts'],
  ['danger', 'bg', 4.5, 'field error messages'],
  ['success', 'success-bg', 4.5, 'success alerts and badges'],
  ['warning', 'warning-bg', 4.5, 'warning alerts'],
  ['accent', 'surface', 3, 'Devanagari accents (large)'],
  ['gold-text', 'bg', 4.5, 'small gold text (tagline, footer)'],
  ['gold-text', 'bg-elevated', 4.5, 'small gold text on the footer'],
  ['text-muted', 'surface-muted', 4.5, 'disabled button labels'],
];

describe.each(THEMES.map((t) => t.id))('theme %s is readable', (id) => {
  const tokens = themeTokens(id);
  it.each(PAIRS)('%s on %s ≥ %s:1 (%s)', (fg, bg, min) => {
    const ratio = contrast(tokens[fg] ?? '', tokens[bg] ?? '');
    expect(ratio, `${fg} ${tokens[fg]} on ${bg} ${tokens[bg]} is ${ratio.toFixed(2)}:1`).toBeGreaterThanOrEqual(min);
  });
});
