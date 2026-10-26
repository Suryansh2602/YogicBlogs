import { forwardRef, useId, type TextareaHTMLAttributes } from 'react';
import './ui.css';

interface TextAreaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label: string;
  error?: string | undefined;
  hint?: string;
  /** Shows "n / max" under the field when set. */
  maxLength?: number;
  value: string;
}

/** Multi-line field with the same label, hint, error and accessibility wiring as TextField. */
export const TextArea = forwardRef<HTMLTextAreaElement, TextAreaProps>(function TextArea(
  { label, error, hint, id, className = '', maxLength, value, rows = 3, ...rest },
  ref,
) {
  const autoId = useId();
  const inputId = id ?? autoId;
  const noteId = `${inputId}-note`;
  const over = maxLength !== undefined && value.length > maxLength;
  return (
    <div className={`field ${error ? 'field--invalid' : ''} ${className}`}>
      <label htmlFor={inputId} className="field__label">
        {label}
      </label>
      <textarea
        ref={ref}
        id={inputId}
        className="field__input field__textarea"
        rows={rows}
        value={value}
        aria-invalid={Boolean(error) || over ? true : undefined}
        aria-describedby={noteId}
        {...rest}
      />
      <div id={noteId} className="field__note">
        {error ? (
          <span className="field__error" role="alert">
            {error}
          </span>
        ) : (
          <span className="field__hint">{hint}</span>
        )}
        {maxLength !== undefined && (
          <span className={over ? 'field__count field__count--over' : 'field__count'}>
            {value.length} / {maxLength}
          </span>
        )}
      </div>
    </div>
  );
});
