import { forwardRef, useId, type InputHTMLAttributes, type ReactNode } from 'react';
import './ui.css';

export interface TextFieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'size'> {
  label: string;
  error?: string | undefined;
  hint?: ReactNode;
  /** Rendered inside the field on the right (e.g. a show-password button). */
  trailing?: ReactNode;
}

export const TextField = forwardRef<HTMLInputElement, TextFieldProps>(function TextField(
  { label, error, hint, trailing, id, className = '', ...rest },
  ref,
) {
  const autoId = useId();
  const inputId = id ?? autoId;
  const hintId = `${inputId}-hint`;
  const errorId = `${inputId}-error`;
  const describedBy = [hint ? hintId : null, error ? errorId : null].filter(Boolean).join(' ') || undefined;

  return (
    <div className={`field ${error ? 'field--invalid' : ''} ${className}`}>
      <label htmlFor={inputId} className="field__label">
        {label}
      </label>
      <div className="field__control">
        <input ref={ref} id={inputId} className="field__input" aria-invalid={error ? true : undefined} aria-describedby={describedBy} {...rest} />
        {trailing && <span className="field__trailing">{trailing}</span>}
      </div>
      {hint && !error && (
        <div id={hintId} className="field__hint">
          {hint}
        </div>
      )}
      {error && (
        <div id={errorId} className="field__error" role="alert">
          {error}
        </div>
      )}
    </div>
  );
});
