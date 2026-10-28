import type { CSSProperties, ElementType } from 'react';
import { useInView } from './useInView';
import './motion.css';

interface BlurRevealProps {
  text: string;
  as?: ElementType;
  className?: string;
  /** Delay between words, ms. */
  stagger?: number;
  /** Delay before the first word, ms. */
  delay?: number;
}

/**
 * Words drift up out of a soft blur, one after another, when the text scrolls into view.
 * Screen readers get the plain sentence once (the animated words are aria-hidden).
 */
export function BlurReveal({ text, as: Tag = 'span', className = '', stagger = 70, delay = 0 }: BlurRevealProps) {
  const { ref, inView } = useInView<HTMLSpanElement>();
  // Words can repeat, so keys include the index.
  const words = text.split(' ');
  return (
    <Tag className={className}>
      <span className="visually-hidden">{text}</span>
      <span ref={ref} aria-hidden="true" className={`blur-reveal ${inView ? 'blur-reveal--in' : ''}`}>
        {words.map((word, i) => (
          <span
            key={`${word}-${i}`}
            className="blur-reveal__word"
            style={{ '--delay': `${delay + i * stagger}ms` } as CSSProperties}
          >
            {word}
            {i < words.length - 1 ? ' ' : ''}
          </span>
        ))}
      </span>
    </Tag>
  );
}
