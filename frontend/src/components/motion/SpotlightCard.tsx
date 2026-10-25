import { useRef, type ElementType, type PointerEvent, type ReactNode } from 'react';
import './motion.css';

interface SpotlightCardProps {
  children: ReactNode;
  className?: string;
  as?: ElementType;
}

/**
 * A card with a soft glow that follows the pointer. The position is written to CSS variables directly
 * (no React state), so moving the mouse never re-renders anything.
 */
export function SpotlightCard({ children, className = '', as: Tag = 'div' }: SpotlightCardProps) {
  const ref = useRef<HTMLElement>(null);
  const onPointerMove = (event: PointerEvent<HTMLElement>) => {
    const node = ref.current;
    if (!node) return;
    const rect = node.getBoundingClientRect();
    node.style.setProperty('--spot-x', `${event.clientX - rect.left}px`);
    node.style.setProperty('--spot-y', `${event.clientY - rect.top}px`);
  };
  return (
    <Tag ref={ref} className={`spotlight-card ${className}`} onPointerMove={onPointerMove}>
      {children}
    </Tag>
  );
}
