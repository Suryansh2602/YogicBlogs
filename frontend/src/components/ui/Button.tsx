import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { Spinner } from './Spinner';
import './ui.css';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  size?: 'md' | 'lg' | 'sm';
  loading?: boolean;
  block?: boolean;
  children: ReactNode;
}

export function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  block = false,
  disabled,
  children,
  className = '',
  type = 'button',
  ...rest
}: ButtonProps) {
  return (
    <button
      {...rest}
      type={type}
      disabled={Boolean(disabled) || loading}
      aria-busy={loading || undefined}
      className={`btn btn--${variant} btn--${size} ${block ? 'btn--block' : ''} ${className}`}
    >
      {loading && <Spinner size={16} />}
      <span className="btn__label">{children}</span>
    </button>
  );
}
