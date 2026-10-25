import './mystic.css';

/**
 * A simple yantra in fine lines: outer circles, two interlocking triangles (shatkona: the meeting of
 * stillness and movement) and the bindu at the centre. Turns very slowly and "breathes" at the pace of a
 * calm breath (about 6 per minute). Decorative only.
 */
export function Yantra({ size = 220, className = '' }: { size?: number; className?: string }) {
  return (
    <svg className={`yantra ${className}`} viewBox="-100 -100 200 200" width={size} height={size} aria-hidden="true" focusable="false">
      <g className="yantra__breath">
        <g className="yantra__turn">
          <circle r="96" className="yantra__line" />
          <circle r="88" className="yantra__line yantra__line--dashed" />
          <polygon points="0,-78 67.5,39 -67.5,39" className="yantra__line" />
          <polygon points="0,78 67.5,-39 -67.5,-39" className="yantra__line" />
          <circle r="45" className="yantra__line" />
          {[0, 45, 90, 135, 180, 225, 270, 315].map((a) => (
            <path key={a} d="M0 -45 C-7 -56 -7 -66 0 -74 C7 -66 7 -56 0 -45 Z" transform={`rotate(${a})`} className="yantra__line" />
          ))}
        </g>
        <circle r="3" className="yantra__bindu" />
      </g>
    </svg>
  );
}
