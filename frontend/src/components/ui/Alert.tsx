import type { ReactNode } from 'react';
import './ui.css';

interface AlertProps {
  tone?: 'info' | 'success' | 'danger' | 'warning';
  title?: string;
  children?: ReactNode;
}

export function Alert({ tone = 'info', title, children }: AlertProps) {
  return (
    <div className={`alert alert--${tone}`} role={tone === 'danger' ? 'alert' : 'status'}>
      {title && <strong className="alert__title">{title}</strong>}
      {children && <div className="alert__body">{children}</div>}
    </div>
  );
}
