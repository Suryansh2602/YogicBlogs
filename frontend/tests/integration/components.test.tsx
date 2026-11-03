import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useState } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { OtpInput } from '../../src/components/ui/OtpInput';
import { PasswordField } from '../../src/components/ui/PasswordField';
import { ThemeSwitcher } from '../../src/components/ui/ThemeSwitcher';
import { ThemeProvider } from '../../src/theme/ThemeProvider';
import { THEMES } from '../../src/theme/themes';
import { Button } from '../../src/components/ui/Button';

function Otp({ onComplete }: { onComplete: (v: string) => void }) {
  const [value, setValue] = useState('');
  return <OtpInput value={value} onChange={setValue} onComplete={onComplete} />;
}

describe('OtpInput', () => {
  it('moves along as digits are typed and reports the full code', async () => {
    const onComplete = vi.fn();
    render(<Otp onComplete={onComplete} />);
    await userEvent.click(screen.getByLabelText('Digit 1 of 6'));
    await userEvent.keyboard('123456');
    expect(onComplete).toHaveBeenCalledWith('123456');
    expect(screen.getByLabelText('Digit 6 of 6')).toHaveValue('6');
  });

  it('accepts a pasted code, ignores letters, and supports backspace', async () => {
    const onComplete = vi.fn();
    render(<Otp onComplete={onComplete} />);
    const first = screen.getByLabelText('Digit 1 of 6');
    fireEvent.paste(first, { clipboardData: { getData: () => '98 76 54' } });
    expect(onComplete).toHaveBeenCalledWith('987654');

    const last = screen.getByLabelText('Digit 6 of 6');
    await userEvent.click(last);
    await userEvent.keyboard('{Backspace}');
    expect(last).toHaveValue('');
    await userEvent.keyboard('{Backspace}');
    expect(screen.getByLabelText('Digit 5 of 6')).toHaveValue('');
    await userEvent.type(screen.getByLabelText('Digit 5 of 6'), 'x');
    expect(screen.getByLabelText('Digit 5 of 6')).toHaveValue('');
  });
});

describe('PasswordField', () => {
  it('shows and hides the password and rates its strength', async () => {
    function Field() {
      const [v, setV] = useState('');
      return (
        <PasswordField
          label="Password"
          value={v}
          showStrength
          onChange={(e) => {
            setV(e.target.value);
          }}
        />
      );
    }
    render(<Field />);
    const input = screen.getByLabelText('Password');
    expect(input).toHaveAttribute('type', 'password');
    await userEvent.click(screen.getByRole('button', { name: 'Show password' }));
    expect(input).toHaveAttribute('type', 'text');
    await userEvent.type(input, 'Turmeric-and-tulsi-every-dawn');
    expect(screen.getByText('Excellent')).toBeInTheDocument();
  });
});

const UI_CSS = resolve('src/components/ui/ui.css'); // tests run from frontend/

describe('ThemeSwitcher', () => {
  // The toggle holds all four themes and CSS shows the one in <html data-theme> (so prerendered pages are
  // right for everyone). Tests skip CSS, so load the real rules: hidden names then drop out of the
  // accessible name, as they do for screen readers.
  beforeEach(() => {
    const style = document.createElement('style');
    style.id = 'ui-css';
    style.textContent = readFileSync(UI_CSS, 'utf8');
    document.head.append(style);
  });
  afterEach(() => {
    document.getElementById('ui-css')?.remove();
    document.documentElement.removeAttribute('data-theme');
  });

  it('applies and remembers the chosen theme', async () => {
    render(
      <ThemeProvider>
        <ThemeSwitcher />
      </ThemeProvider>,
    );
    expect(document.documentElement.dataset['theme']).toBe('ushas');
    expect(screen.getByRole('button', { name: /change theme/ })).toHaveAccessibleName('Ushas : change theme');
    await userEvent.click(screen.getByRole('button', { name: /change theme/ }));
    await userEvent.click(screen.getByRole('button', { name: /Kesar/ }));
    expect(document.documentElement.dataset['theme']).toBe('kesar');
    expect(localStorage.getItem('hm-theme')).toBe('kesar');
    expect(screen.queryByRole('group', { name: 'Choose a theme' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /change theme/ })).toHaveAccessibleName('Kesar : change theme');
  });

  it('shows the swatch colours from CSS classes, matching the theme list', () => {
    const css = readFileSync(UI_CSS, 'utf8');
    for (const t of THEMES) {
      const rule = new RegExp(`\\.theme-swatch--${t.id} \\{([^}]*)\\}`).exec(css)?.[1] ?? '';
      t.swatch.forEach((colour, i) => {
        expect(rule, `${t.id} colour ${String(i + 1)}`).toContain(`--swatch-${String(i + 1)}: ${colour};`);
      });
    }
  });

  it('closes with Escape and starts from a saved theme', async () => {
    localStorage.setItem('hm-theme', 'vana');
    render(
      <ThemeProvider>
        <ThemeSwitcher />
      </ThemeProvider>,
    );
    expect(document.documentElement.dataset['theme']).toBe('vana');
    await userEvent.click(screen.getByRole('button', { name: /change theme/ }));
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('group', { name: 'Choose a theme' })).not.toBeInTheDocument();
  });
});

describe('Button', () => {
  it('is disabled and busy while loading', () => {
    render(<Button loading>Save</Button>);
    const button = screen.getByRole('button', { name: /Save/ });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute('aria-busy', 'true');
  });
});
