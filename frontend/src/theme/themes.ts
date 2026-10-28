export const THEMES = [
  { id: 'ushas', name: 'Ushas', meaning: 'Dawn', deva: 'उषस्', swatch: ['#fbf6ef', '#e8728f', '#12807f'] },
  { id: 'ratri', name: 'Ratri', meaning: 'Night', deva: 'रात्रि', swatch: ['#0e0d0c', '#f2b85a', '#3cc4c0'] },
  { id: 'kesar', name: 'Kesar', meaning: 'Saffron', deva: 'केसर', swatch: ['#fff5e8', '#e8941a', '#c2481b'] },
  { id: 'vana', name: 'Vana', meaning: 'Forest', deva: 'वन', swatch: ['#f0f5ef', '#d0607e', '#1f7a57'] },
] as const;

export type ThemeId = (typeof THEMES)[number]['id'];

export const STORAGE_KEY = 'hm-theme';

export const isThemeId = (value: unknown): value is ThemeId => THEMES.some((t) => t.id === value);

/** Same rule as public/theme-init.js: saved choice, else the device's light/dark preference. */
export function initialTheme(): ThemeId {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (isThemeId(saved)) return saved;
  } catch {
    // Storage blocked (private mode, strict settings): fall through to the device preference.
  }
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'ratri' : 'ushas';
}
