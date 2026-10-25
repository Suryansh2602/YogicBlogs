import './motion.css';

/**
 * Slow-drifting coloured glows behind a section (lotus, teal and saffron in the active theme).
 * Three blurred gradients animated with transform only, so the GPU composites them cheaply.
 */
export function Aurora({ className = '' }: { className?: string }) {
  return (
    <div className={`aurora ${className}`} aria-hidden="true">
      <span className="aurora__blob aurora__blob--1" />
      <span className="aurora__blob aurora__blob--2" />
      <span className="aurora__blob aurora__blob--3" />
    </div>
  );
}
