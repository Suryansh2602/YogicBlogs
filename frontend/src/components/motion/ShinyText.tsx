import type { CSSProperties, ReactNode } from 'react';
import './motion.css';

/** A slow sheen of light passing across text, like lamplight on gold leaf. CSS only. */
export function ShinyText({ children, className = '', style }: { children: ReactNode; className?: string; style?: CSSProperties }) {
  return (
    <span className={`shiny-text ${className}`} style={style}>
      {children}
    </span>
  );
}
