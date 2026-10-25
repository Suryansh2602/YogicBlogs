import { useId, type InputHTMLAttributes, type ReactNode } from 'react';
import './ui.css';

interface CheckboxProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> {
  children: ReactNode;
  error?: string | undefined;
}

export function Checkbox({ children, error, id, ...rest }: CheckboxProps) {
  const autoId = useId();
  const inputId = id ?? autoId;
  return (
    <div className={`check ${error ? 'check--invalid' : ''}`}>
      <input id={inputId} type="checkbox" className="check__input" aria-invalid={error ? true : undefined} {...rest} />
      <label htmlFor={inputId} className="check__label">
        {children}
      </label>
      {error && (
        <div className="field__error check__error" role="alert">
          {error}
        </div>
      )}
    </div>
  );
}
