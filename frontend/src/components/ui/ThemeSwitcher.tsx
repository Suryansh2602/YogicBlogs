import { useEffect, useRef, useState } from 'react';
import { THEMES } from '../../theme/themes';
import { useTheme } from '../../theme/useTheme';
import './ui.css';

/** Theme picker: a swatch button that opens the four themes, each with its Sanskrit name. */
export function ThemeSwitcher() {
  const { theme, setTheme } = useTheme();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const current = THEMES.find((t) => t.id === theme) ?? THEMES[0];

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
        <span className="theme-swatch" aria-hidden="true">
          {current.swatch.map((c) => (
            <span key={c} style={{ background: c }} />
          ))}
        </span>
        <span className="theme-switcher__name">{current.name}</span>
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
              <span className="theme-swatch theme-swatch--lg" aria-hidden="true">
                {t.swatch.map((c) => (
                  <span key={c} style={{ background: c }} />
                ))}
              </span>
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
