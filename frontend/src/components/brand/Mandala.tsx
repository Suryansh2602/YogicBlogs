import './brand.css';

interface Ring {
  radius: number;
  count: number;
  /** Petal length and width as a share of the ring radius. */
  length: number;
  width: number;
}

const RINGS: Ring[] = [
  { radius: 34, count: 8, length: 0.7, width: 0.32 },
  { radius: 62, count: 12, length: 0.5, width: 0.2 },
  { radius: 92, count: 16, length: 0.36, width: 0.14 },
  { radius: 122, count: 24, length: 0.26, width: 0.09 },
  { radius: 150, count: 32, length: 0.16, width: 0.06 },
];

/** A lotus petal pointing up from the origin, as an SVG path. */
function petal(length: number, width: number) {
  const w = width / 2;
  return `M0 0 C${-w} ${-length * 0.35} ${-w} ${-length * 0.75} 0 ${-length} C${w} ${-length * 0.75} ${w} ${-length * 0.35} 0 0 Z`;
}

interface MandalaProps {
  size?: number;
  /** Rings rotate slowly in alternating directions. */
  spin?: boolean;
  className?: string;
}

/**
 * Decorative mandala drawn from rings of lotus petals. Pure SVG + CSS (no canvas or WebGL),
 * so it costs a few kilobytes and stays sharp at any size. Hidden from screen readers.
 */
export function Mandala({ size = 360, spin = true, className = '' }: MandalaProps) {
  return (
    <svg
      viewBox="-195 -195 390 390"
      width={size}
      height={size}
      aria-hidden="true"
      focusable="false"
      className={`mandala ${spin ? 'mandala--spin' : ''} ${className}`}
    >
      <circle r="12" fill="currentColor" opacity="0.5" />
      <circle r="20" fill="none" stroke="currentColor" strokeWidth="1" opacity="0.6" />
      {RINGS.map((ring, i) => {
        const d = petal(ring.radius * ring.length * 1.6, ring.radius * ring.width * 1.6);
        return (
          <g key={ring.radius} className={`mandala__ring mandala__ring--${i % 2 ? 'ccw' : 'cw'}`} style={{ animationDuration: `${90 + i * 30}s` }}>
            <circle r={ring.radius} fill="none" stroke="currentColor" strokeWidth="0.75" strokeDasharray={i % 2 ? '2 4' : undefined} opacity="0.7" />
            {Array.from({ length: ring.count }, (_, k) => (
              <path
                key={k}
                d={d}
                transform={`rotate(${(360 / ring.count) * k}) translate(0 ${-ring.radius + 2})`}
                fill={i % 2 ? 'none' : 'currentColor'}
                fillOpacity={0.35}
                stroke="currentColor"
                strokeWidth="0.9"
              />
            ))}
          </g>
        );
      })}
    </svg>
  );
}
