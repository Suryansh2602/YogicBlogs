// The small pieces shared by typed text: the blinking caret and the Pause button (WCAG 2.2.2).
export function Caret() {
  return <span className="typed__caret" />;
}

interface TypedPauseProps {
  /** What moves, for screen readers: "headline" or "verse". */
  label: string;
  paused: boolean;
  onToggle: () => void;
}

export function TypedPause({ label, paused, onToggle }: TypedPauseProps) {
  return (
    <button type="button" className="typed-pause" aria-pressed={paused} onClick={onToggle}>
      <span aria-hidden="true">{paused ? '▶' : '❚❚'}</span>
      <span className="visually-hidden">{`${paused ? 'Play' : 'Pause'} the ${label} animation`}</span>
    </button>
  );
}
