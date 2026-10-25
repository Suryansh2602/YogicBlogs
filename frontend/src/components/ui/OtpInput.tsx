import { useRef, type ClipboardEvent, type KeyboardEvent } from 'react';
import './ui.css';

interface OtpInputProps {
  value: string;
  onChange: (value: string) => void;
  /** Called when all 6 digits are filled (e.g. to submit automatically). */
  onComplete?: (value: string) => void;
  disabled?: boolean;
  label?: string;
  invalid?: boolean;
}

const LENGTH = 6;

/**
 * Six boxes for an authenticator code. Supports typing, backspace, arrow keys and pasting the whole
 * code; `autocomplete="one-time-code"` lets phones offer the code automatically.
 */
export function OtpInput({ value, onChange, onComplete, disabled = false, label = 'Authentication code', invalid = false }: OtpInputProps) {
  const refs = useRef<(HTMLInputElement | null)[]>([]);
  const digits = Array.from({ length: LENGTH }, (_, i) => value[i] ?? '');

  const focus = (i: number) => refs.current[Math.max(0, Math.min(LENGTH - 1, i))]?.focus();

  const update = (next: string) => {
    const clean = next.replace(/\D/g, '').slice(0, LENGTH);
    onChange(clean);
    if (clean.length === LENGTH) onComplete?.(clean);
  };

  const onInput = (i: number, raw: string) => {
    const typed = raw.replace(/\D/g, '');
    if (!typed) return;
    // Typing several digits into one box (autofill) fills the following boxes too.
    const next = (value.slice(0, i) + typed + value.slice(i + typed.length)).slice(0, LENGTH);
    update(next);
    focus(i + typed.length);
  };

  const onKeyDown = (i: number, event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Backspace') {
      event.preventDefault();
      if (digits[i]) update(value.slice(0, i) + value.slice(i + 1));
      else if (i > 0) {
        update(value.slice(0, i - 1) + value.slice(i));
        focus(i - 1);
      }
    } else if (event.key === 'ArrowLeft') focus(i - 1);
    else if (event.key === 'ArrowRight') focus(i + 1);
  };

  const onPaste = (event: ClipboardEvent<HTMLInputElement>) => {
    event.preventDefault();
    const pasted = event.clipboardData.getData('text').replace(/\D/g, '').slice(0, LENGTH);
    if (pasted) {
      update(pasted);
      focus(pasted.length);
    }
  };

  return (
    <fieldset className={`otp ${invalid ? 'otp--invalid' : ''}`} disabled={disabled}>
      <legend className="visually-hidden">{label}</legend>
      {digits.map((digit, i) => (
        <input
          key={i}
          ref={(node) => {
            refs.current[i] = node;
          }}
          className="otp__box"
          value={digit}
          inputMode="numeric"
          autoComplete={i === 0 ? 'one-time-code' : 'off'}
          maxLength={LENGTH}
          aria-label={`Digit ${i + 1} of ${LENGTH}`}
          aria-invalid={invalid || undefined}
          onChange={(e) => {
            onInput(i, e.target.value);
          }}
          onKeyDown={(e) => {
            onKeyDown(i, e);
          }}
          onPaste={onPaste}
          onFocus={(e) => {
            e.target.select();
          }}
        />
      ))}
    </fieldset>
  );
}
