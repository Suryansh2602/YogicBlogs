import type { CSSProperties } from 'react';
import './mystic.css';

// Deterministic "random" so the sky is the same on every render (and server/client never disagree).
function seeded(seed: number) {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

const STARS = (() => {
  const rand = seeded(108); // 108: a sacred number in yoga traditions
  return Array.from({ length: 64 }, () => ({
    x: rand() * 100,
    y: rand() * 100,
    r: 0.5 + rand() * 1.1,
    delay: rand() * 6,
    duration: 3 + rand() * 4,
  }));
})();

/**
 * Nakshatra: a quiet field of stars that slowly twinkle (opacity only: no blur, no glow).
 * Pure SVG (64 tiny circles, 0.5–1.6 px); hidden from screen readers.
 */
export function Nakshatra({ className = '' }: { className?: string }) {
  return (
    <svg className={`nakshatra ${className}`} aria-hidden="true" focusable="false">
      {STARS.map((star, i) => (
        <circle
          key={i}
          // Percent positions on an unscaled canvas keep every star round at any width.
          cx={`${star.x}%`}
          cy={`${star.y}%`}
          r={star.r}
          className="nakshatra__star"
          style={{ '--twinkle-delay': `${star.delay}s`, '--twinkle-duration': `${star.duration}s` } as CSSProperties}
        />
      ))}
    </svg>
  );
}
