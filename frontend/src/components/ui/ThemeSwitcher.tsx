import { useEffect, useRef, useState } from 'react';
import { THEMES, type ThemeId } from '../../theme/themes';
import { useTheme } from '../../theme/useTheme';
import './ui.css';

/** The three dots of a theme's colours. Colours come from CSS classes: no inline styles (see the CSP). */
function Swatch({ id, large = false }: { id: ThemeId; large?: boolean }) {
  return (
    <span className={`theme-swatch theme-swatch--${id} ${large ? 'theme-swatch--lg' : ''}`} aria-hidden="true">
      <span />
      <span />
      <span />
    </span>
  );
}

/**
 * Theme picker: a swatch button that opens the four themes, each with its Sanskrit name. The button holds
 * every theme and CSS shows the one in <html data-theme>, which theme-init.js sets before first paint: the
 * right one appears at once, even on a prerendered page, and React never has to draw it differently.
 */
export function ThemeSwitcher() {
  const { theme, setTheme } = useTheme();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return undefined;
    const close = (event: MouseEvent | KeyboardEvent) => {
      if (event instanceof KeyboardEvent ? event.key === 'Escape' : !rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', close);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', close);
    };
  }, [open]);

  return (
    <div className="theme-switcher" ref={rootRef}>
      <button
        type="button"
        className="theme-switcher__toggle"
        aria-haspopup="true"
        aria-expanded={open}
        onClick={() => {
          setOpen((o) => !o);
        }}
      >
        {THEMES.map((t) => (
          <span key={t.id} className={`theme-switcher__current theme-switcher__current--${t.id}`}>
            <Swatch id={t.id} />
            <span className="theme-switcher__name">{t.name}</span>
          </span>
        ))}
        <span className="visually-hidden">: change theme</span>
      </button>
      {open && (
        <div className="theme-switcher__menu" role="group" aria-label="Choose a theme">
          {THEMES.map((t) => (
            <button
              key={t.id}
              type="button"
              className="theme-switcher__option"
              aria-pressed={t.id === theme}
              onClick={() => {
                setTheme(t.id);
                setOpen(false);
              }}
            >
              <Swatch id={t.id} large />
              <span className="theme-switcher__text">
                <span>
                  {t.name} <span className="deva">{t.deva}</span>
                </span>
                <small>{t.meaning}</small>
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
