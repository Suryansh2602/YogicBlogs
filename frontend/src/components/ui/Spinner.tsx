import './ui.css';

/** A small rotating chakra (eight-spoked wheel) used as the loading indicator. */
export function Spinner({ size = 20, label }: { size?: number; label?: string }) {
  return (
    <svg
      className="spinner"
      viewBox="-12 -12 24 24"
      width={size}
      height={size}
      role={label ? 'status' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      <circle r="10" fill="none" stroke="currentColor" strokeWidth="2" opacity="0.35" />
      {Array.from({ length: 8 }, (_, i) => (
        <line key={i} x1="0" y1="0" x2="0" y2="-10" stroke="currentColor" strokeWidth="1.6" transform={`rotate(${i * 45})`} />
      ))}
      <circle r="2.4" fill="currentColor" />
    </svg>
  );
}
