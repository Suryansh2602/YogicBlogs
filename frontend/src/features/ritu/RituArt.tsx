// A small illustration for each ritu, so the season reads at a glance: frost, blossoms, blazing sun, rain,
// clear moonlit sky, mist. Pure SVG (no image downloads), decorative only (aria-hidden): every word that
// matters is in the text next to it.
import type { RituId } from './calendar';

interface Props {
  ritu: RituId;
  className?: string;
}

const SKY: Record<RituId, [string, string]> = {
  shishira: ['#dfeaf6', '#b9cde4'],
  vasanta: ['#fde7ef', '#d9f0d6'],
  grishma: ['#ffe2a6', '#ffb35c'],
  varsha: ['#9fb3c8', '#5d7590'],
  sharad: ['#cfe6fb', '#9fcdf2'],
  hemanta: ['#f1e6d4', '#d8cbb6'],
};

function Shishira() {
  return (
    <>
      <circle cx="122" cy="30" r="13" fill="#f6f9fc" opacity="0.9" />
      <path d="M0 82 Q40 70 80 80 T160 76 V100 H0Z" fill="#f4f8fc" />
      <path d="M22 100 V58 M22 70 L10 60 M22 64 L33 54 M22 76 L36 70" stroke="#6b7f95" strokeWidth="2.2" strokeLinecap="round" fill="none" />
      {[
        [58, 22],
        [88, 40],
        [140, 58],
        [70, 58],
        [104, 18],
      ].map(([x = 0, y = 0]) => (
        <g key={`${String(x)}-${String(y)}`} stroke="#ffffff" strokeWidth="1.6" strokeLinecap="round">
          <path d={`M${String(x - 5)} ${String(y)} H${String(x + 5)} M${String(x)} ${String(y - 5)} V${String(y + 5)} M${String(x - 3.5)} ${String(y - 3.5)} L${String(x + 3.5)} ${String(y + 3.5)} M${String(x - 3.5)} ${String(y + 3.5)} L${String(x + 3.5)} ${String(y - 3.5)}`} />
        </g>
      ))}
    </>
  );
}

function Vasanta() {
  const flower = (x: number, y: number, r: number, color: string) => (
    <g key={`${String(x)}-${String(y)}`}>
      {[0, 72, 144, 216, 288].map((a) => (
        <ellipse key={a} cx={x} cy={y - r} rx={r * 0.55} ry={r} fill={color} transform={`rotate(${String(a)} ${String(x)} ${String(y)})`} />
      ))}
      <circle cx={x} cy={y} r={r * 0.45} fill="#f6c34a" />
    </g>
  );
  return (
    <>
      <path d="M0 84 Q50 74 100 82 T160 80 V100 H0Z" fill="#9fd58f" />
      <path d="M30 100 Q34 70 52 52 M52 52 Q70 40 92 44 M52 52 Q48 36 58 24" stroke="#7a5a3c" strokeWidth="2.6" fill="none" strokeLinecap="round" />
      {flower(58, 24, 6, '#f39ab6')}
      {flower(92, 44, 7, '#f7b6c8')}
      {flower(74, 34, 5, '#f39ab6')}
      {flower(126, 70, 6, '#ffffff')}
      {flower(144, 78, 5, '#f7b6c8')}
      <path d="M40 60 q6 -8 12 0 q-6 6 -12 0Z M100 50 q6 -8 12 0 q-6 6 -12 0Z" fill="#6cbf6a" />
    </>
  );
}

function Grishma() {
  return (
    <>
      <g stroke="#ff8a1f" strokeWidth="3" strokeLinecap="round">
        {Array.from({ length: 12 }, (_, i) => {
          const a = (i * Math.PI) / 6;
          return <line key={i} x1={80 + Math.cos(a) * 24} y1={42 + Math.sin(a) * 24} x2={80 + Math.cos(a) * 34} y2={42 + Math.sin(a) * 34} />;
        })}
      </g>
      <circle cx="80" cy="42" r="18" fill="#ffd23f" stroke="#ffb21c" strokeWidth="3" />
      <path d="M0 88 Q40 80 80 86 T160 84 V100 H0Z" fill="#e8a75a" />
      <path d="M18 78 q6 -4 12 0 t12 0 M118 76 q6 -4 12 0 t12 0" stroke="#fff3d0" strokeWidth="1.6" fill="none" strokeLinecap="round" opacity="0.9" />
    </>
  );
}

function Varsha() {
  return (
    <>
      <g fill="#e9eef4">
        <ellipse cx="58" cy="30" rx="30" ry="14" />
        <ellipse cx="84" cy="24" rx="24" ry="15" />
        <ellipse cx="108" cy="32" rx="26" ry="12" />
      </g>
      <g stroke="#dfe9f5" strokeWidth="2" strokeLinecap="round">
        {[40, 54, 68, 82, 96, 110, 124].map((x, i) => (
          <line key={x} x1={x} y1={48 + (i % 2) * 4} x2={x - 6} y2={66 + (i % 2) * 4} />
        ))}
      </g>
      <path d="M0 86 Q40 80 80 86 T160 84 V100 H0Z" fill="#4c7a5e" />
      <ellipse cx="50" cy="92" rx="14" ry="3" fill="#a9c3dc" opacity="0.8" />
      <ellipse cx="116" cy="90" rx="10" ry="2.5" fill="#a9c3dc" opacity="0.8" />
    </>
  );
}

function Sharad() {
  return (
    <>
      <circle cx="118" cy="28" r="14" fill="#fffdf2" />
      <circle cx="118" cy="28" r="20" fill="#fffdf2" opacity="0.25" />
      <g fill="#ffffff" opacity="0.95">
        <ellipse cx="44" cy="30" rx="20" ry="7" />
        <ellipse cx="58" cy="26" rx="14" ry="7" />
      </g>
      <path d="M0 80 H160 V100 H0Z" fill="#6aa7cf" />
      <g transform="translate(70 80)">
        <path d="M0 0 C-10 -6 -12 -16 -6 -22 C-2 -14 0 -8 0 0Z M0 0 C10 -6 12 -16 6 -22 C2 -14 0 -8 0 0Z M0 0 C-4 -10 -2 -22 0 -26 C2 -22 4 -10 0 0Z" fill="#f2a6bd" />
        <ellipse cx="0" cy="2" rx="16" ry="3" fill="#3f8a5c" />
      </g>
    </>
  );
}

function Hemanta() {
  return (
    <>
      <circle cx="104" cy="38" r="14" fill="#fff4d9" opacity="0.9" />
      <path d="M0 70 Q30 52 60 66 T120 60 T160 64 V100 H0Z" fill="#b9a98f" />
      <path d="M0 82 Q40 72 80 80 T160 78 V100 H0Z" fill="#8f9f80" />
      <g fill="#ffffff" opacity="0.55">
        <rect x="0" y="56" width="160" height="5" rx="2.5" />
        <rect x="20" y="66" width="120" height="4" rx="2" />
      </g>
      <g fill="#e8f2fb">
        <circle cx="30" cy="90" r="1.8" />
        <circle cx="62" cy="88" r="1.6" />
        <circle cx="128" cy="92" r="1.8" />
      </g>
    </>
  );
}

const SCENES: Record<RituId, () => React.JSX.Element> = { shishira: Shishira, vasanta: Vasanta, grishma: Grishma, varsha: Varsha, sharad: Sharad, hemanta: Hemanta };

export function RituArt({ ritu, className = '' }: Props) {
  const [top, bottom] = SKY[ritu];
  const Scene = SCENES[ritu];
  const id = `ritu-sky-${ritu}`;
  return (
    <svg viewBox="0 0 160 100" preserveAspectRatio="xMidYMid slice" className={`ritu-art ${className}`} aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={top} />
          <stop offset="1" stopColor={bottom} />
        </linearGradient>
      </defs>
      <rect width="160" height="100" fill={`url(#${id})`} />
      <Scene />
    </svg>
  );
}
