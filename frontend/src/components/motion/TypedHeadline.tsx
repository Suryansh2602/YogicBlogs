// A headline that types its slogans one after another: types, holds, erases, types the next.
// The first slogan is complete on arrival, so the animation never delays the page. Every slogan also sits
// invisibly in the same grid cell, which keeps the height of the tallest one: nothing below moves.
// Screen readers get one steady heading; the moving text is hidden from them. The Pause button stops the
// motion (WCAG 2.2.2), and visitors who prefer reduced motion see the first slogan standing still.
import { Caret, TypedPause } from './TypedParts';
import { useTypedCycle } from './useTypedCycle';
import './motion.css';

export interface Slogan {
  text: string;
  /** The closing words, set in the accent style. */
  accent: string;
}

const TIMING = { typeMs: 55, eraseMs: 28, holdMs: 2800, gapMs: 350 };

interface TypedHeadlineProps {
  slogans: readonly [Slogan, ...Slogan[]];
  className?: string;
}

export function TypedHeadline({ slogans, className = '' }: TypedHeadlineProps) {
  const first = slogans[0];
  const lengths = slogans.map((s) => s.text.length + 1 + s.accent.length);
  const { index, typed, still, paused, togglePaused } = useTypedCycle(lengths, TIMING);
  const slogan = slogans.at(index) ?? first;

  // The untyped rest stays in the line, invisible, so words never jump to another line while typing.
  const inAccent = typed > slogan.text.length;
  const accentTyped = Math.max(0, typed - slogan.text.length - 1);

  return (
    <div className="typed-wrap">
      <h1 className={className}>
        <span className="visually-hidden">
          {first.text} {first.accent}
        </span>
        <span className="typed" aria-hidden="true">
          {slogans.map((s) => (
            <span key={s.text} className="typed__line typed__line--ghost">
              {s.text} <em className="typed__accent">{s.accent}</em>
            </span>
          ))}
          <span className="typed__line" data-testid="typed-live">
            <span className="typed__shown">{slogan.text.slice(0, typed)}</span>
            {!inAccent && <Caret />}
            <span className="typed__rest">{slogan.text.slice(typed)}</span> <em className="typed__accent">
              <span className="typed__shown">{slogan.accent.slice(0, accentTyped)}</span>
              {inAccent && <Caret />}
              <span className="typed__rest">{slogan.accent.slice(accentTyped)}</span>
            </em>
          </span>
        </span>
      </h1>
      {!still && <TypedPause label="headline" paused={paused} onToggle={togglePaused} />}
    </div>
  );
}
