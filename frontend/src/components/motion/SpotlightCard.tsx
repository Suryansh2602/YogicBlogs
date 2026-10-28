import type { ElementType, ReactNode } from 'react';
import './motion.css';

interface SpotlightCardProps {
  children: ReactNode;
  className?: string;
  as?: ElementType;
}

/**
 * A card that lifts on hover with a tinted edge: clean feedback, no glow over the content.
 * (It used to light up under the pointer; that read as haze, so the effect is now CSS-only.)
 */
export function SpotlightCard({ children, className = '', as: Tag = 'div' }: SpotlightCardProps) {
  return <Tag className={`spotlight-card ${className}`}>{children}</Tag>;
}
