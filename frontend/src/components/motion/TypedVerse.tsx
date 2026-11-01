// A verse that types itself: the Sanskrit, then the transliteration, then the meaning; it holds long enough
// to read, erases, and moves to the next verse. It starts when it scrolls into view. Every verse also sits
// invisibly in the same grid cell, so nothing below moves. Screen readers get the first verse, steady; the
// moving text is hidden from them. Visitors who prefer reduced motion see the first verse standing still.
import { useMemo } from 'react';
import { Caret, TypedPause } from './TypedParts';
import { useInView } from './useInView';
import { graphemes, useTypedCycle } from './useTypedCycle';
import './motion.css';

export interface VerseLines {
  sanskrit: string;
  transliteration: string;
  meaning: string;
}

const TIMING = { typeMs: 30, eraseMs: 10, holdMs: 6000, gapMs: 400 };
const LINE_CLASSES = ['deva typed-verse__sanskrit', 'typed-verse__translit', 'typed-verse__meaning'] as const;

const linesOf = (verse: VerseLines) => [verse.sanskrit, verse.transliteration, verse.meaning];

/** The typed count runs through the lines in turn; each line takes its own part of it. */
function splitTyped(lines: string[][], typed: number) {
  let left = typed;
  return lines.map((line) => {
    const shown = Math.min(left, line.length);
    left -= shown;
    return { shown: line.slice(0, shown).join(''), rest: line.slice(shown).join('') };
  });
}

interface TypedVerseProps {
  verses: readonly [VerseLines, ...VerseLines[]];
}

export function TypedVerse({ verses }: TypedVerseProps) {
  const { ref, inView } = useInView<HTMLDivElement>();
  const typedVerses = useMemo(() => verses.map((verse) => linesOf(verse).map(graphemes)), [verses]);
  const lengths = useMemo(() => typedVerses.map((lines) => lines.flat().length), [typedVerses]);
  const { index, typed, still, paused, togglePaused } = useTypedCycle(lengths, TIMING, { startEmpty: true, active: inView });

  const live = splitTyped(typedVerses.at(index) ?? [], typed);
  const unfinished = live.findIndex((line) => line.rest);
  const caretLine = unfinished === -1 ? live.length - 1 : unfinished;

  return (
    <div className="typed-wrap" ref={ref}>
      <div className="visually-hidden">
        {linesOf(verses[0]).map((line) => (
          <p key={line}>{line}</p>
        ))}
      </div>
      <div className="typed" aria-hidden="true">
        {verses.map((verse) => (
          <div key={verse.sanskrit} className="typed__line typed__line--ghost typed-verse">
            {linesOf(verse).map((line, i) => (
              <p key={line} className={LINE_CLASSES[i as 0 | 1 | 2]}>
                {line}
              </p>
            ))}
          </div>
        ))}
        <div className="typed__line typed-verse" data-testid="typed-verse-live">
          {live.map((line, i) => (
            <p key={LINE_CLASSES[i as 0 | 1 | 2]} className={LINE_CLASSES[i as 0 | 1 | 2]}>
              <span className="typed__shown">{line.shown}</span>
              {i === caretLine && <Caret />}
              <span className="typed__rest">{line.rest}</span>
            </p>
          ))}
        </div>
      </div>
      {!still && <TypedPause label="verse" paused={paused} onToggle={togglePaused} />}
    </div>
  );
}
