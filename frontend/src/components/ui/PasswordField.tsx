import { forwardRef, useState } from 'react';
import { TextField, type TextFieldProps } from './TextField';
import { passwordStrength } from '../../features/auth/passwordPolicy';
import './ui.css';

interface PasswordFieldProps extends Omit<TextFieldProps, 'type' | 'trailing'> {
  /** Show the strength meter (sign-up, reset). */
  showStrength?: boolean;
  value: string;
}

const LEVELS = ['Too weak', 'Weak', 'Fair', 'Strong', 'Excellent'] as const;

export const PasswordField = forwardRef<HTMLInputElement, PasswordFieldProps>(function PasswordField(
  { showStrength = false, value, hint, ...rest },
  ref,
) {
  const [visible, setVisible] = useState(false);
  const score = passwordStrength(value);

  return (
    <TextField
      {...rest}
      ref={ref}
      value={value}
      type={visible ? 'text' : 'password'}
      spellCheck={false}
      autoCapitalize="none"
      trailing={
        <button
          type="button"
          className="field__reveal"
          onClick={() => {
            setVisible((v) => !v);
          }}
          aria-pressed={visible}
          aria-label={visible ? 'Hide password' : 'Show password'}
        >
          {visible ? 'Hide' : 'Show'}
        </button>
      }
      hint={
        showStrength && value ? (
          <span className="strength" data-score={score}>
            <span className="strength__bar" aria-hidden="true">
              {[0, 1, 2, 3].map((i) => (
                <span key={i} className={i < score ? 'strength__seg strength__seg--on' : 'strength__seg'} />
              ))}
            </span>
            <span className="strength__label">{LEVELS[score]}</span>
          </span>
        ) : (
          hint
        )
      }
    />
  );
});
