import type { CSSProperties } from 'react';
import './brand.css';

const RING_LINKS: [number, number, number][] = [
  [149.5, 70.5, 45],
  [170, 120, 90],
  [149.5, 169.5, 135],
  [100, 190, 0],
  [50.5, 169.5, 45],
  [30, 120, 90],
  [50.5, 70.5, 135],
];
const RING_BEADS: [number, number, number][] = [
  [164.7, 93.2, 67.5],
  [164.7, 146.8, 112.5],
  [126.8, 184.7, 157.5],
  [73.2, 184.7, 22.5],
  [35.3, 146.8, 67.5],
  [35.3, 93.2, 112.5],
];

interface LogoMarkProps {
  size?: number;
  /** Petals open and the stem draws itself on mount. */
  animated?: boolean;
  className?: string;
}

/** The Healthmarg mark (lotus in a chain-bead ring). Colours follow the active theme. */
export function LogoMark({ size = 40, animated = false, className = '' }: LogoMarkProps) {
  return (
    <svg
      viewBox="0 8 200 200"
      width={size}
      height={size}
      aria-hidden="true"
      focusable="false"
      className={`logo-mark ${animated ? 'logo-mark--animated' : ''} ${className}`}
    >
      <g className="logo-mark__ring" fill="none" stroke="var(--logo-ring)" strokeWidth="4.5">
        {RING_LINKS.map(([cx, cy, r]) => (
          <ellipse key={`${cx}-${cy}`} cx={cx} cy={cy} rx="12" ry="8.5" transform={`rotate(${r} ${cx} ${cy})`} />
        ))}
      </g>
      <g className="logo-mark__ring" fill="var(--logo-ring)">
        {RING_BEADS.map(([cx, cy, r]) => (
          <ellipse key={`${cx}-${cy}`} cx={cx} cy={cy} rx="10" ry="3.2" transform={`rotate(${r} ${cx} ${cy})`} />
        ))}
      </g>
      <g fill="var(--logo-spark)" className="logo-mark__spark">
        <path d="M38 52 l7 -10 l3 12 z" />
        <path d="M162 52 l-7 -10 l-3 12 z" />
      </g>
      <path
        className="logo-mark__stem"
        d="M100 70 C104 92 101 110 99 128 C97 146 97 160 101 172"
        fill="none"
        stroke="var(--logo-stem)"
        strokeWidth="5"
        strokeLinecap="round"
        pathLength={1}
      />
      <path className="logo-mark__leaf" d="M101 112 C104 96 116 88 130 88 C127 102 116 111 101 112 Z" fill="var(--logo-stem)" />
      <path className="logo-mark__leaf" d="M99 134 C96 120 84 113 70 113 C73 127 84 135 99 134 Z" fill="var(--logo-stem)" />
      <g className="logo-mark__bloom">
        <path className="logo-mark__petal logo-mark__petal--l" d="M100 72 C82 72 70 60 70 42 C86 44 98 56 100 72 Z" fill="var(--logo-petal-soft)" />
        <path className="logo-mark__petal logo-mark__petal--r" d="M100 72 C118 72 130 60 130 42 C114 44 102 56 100 72 Z" fill="var(--logo-petal-soft)" />
        <path className="logo-mark__petal" d="M100 72 C86 60 86 36 100 18 C114 36 114 60 100 72 Z" fill="var(--logo-petal)" />
      </g>
    </svg>
  );
}

/** Mark + "Health·marg" wordmark. */
export function Logo({ size = 40, animated = false }: { size?: number; animated?: boolean }) {
  return (
    <span className="logo" style={{ '--logo-size': `${size}px` } as CSSProperties}>
      <LogoMark size={size} animated={animated} />
      <span className="logo__word">
        <span className="logo__a">Health</span>
        <span className="logo__b">marg</span>
      </span>
    </span>
  );
}
