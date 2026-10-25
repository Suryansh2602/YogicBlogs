import type { CSSProperties } from 'react';
import './brand.css';

const PETALS = [-60, -36, -12, 12, 36, 60];

/** A lotus that blooms open: used for success moments (email verified, account secured). */
export function LotusBloom({ size = 120, label }: { size?: number; label?: string }) {
  return (
    <svg
      viewBox="-60 -70 120 90"
      width={size}
      height={(size * 90) / 120}
      className="lotus-bloom"
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      <ellipse cx="0" cy="12" rx="46" ry="5" fill="var(--logo-stem)" opacity="0.25" className="lotus-bloom__water" />
      {PETALS.map((angle, i) => (
        <path
          key={angle}
          className="lotus-bloom__petal"
          style={{ '--angle': `${angle}deg`, '--i': i } as CSSProperties}
          d="M0 8 C-14 -6 -12 -34 0 -52 C12 -34 14 -6 0 8 Z"
          fill={Math.abs(angle) > 40 ? 'var(--logo-petal-soft)' : 'var(--logo-petal)'}
        />
      ))}
      <path className="lotus-bloom__petal lotus-bloom__petal--center" d="M0 8 C-12 -8 -10 -38 0 -58 C10 -38 12 -8 0 8 Z" fill="var(--logo-petal)" />
      <circle cy="-4" r="4" fill="var(--logo-spark)" className="lotus-bloom__seed" />
    </svg>
  );
}
