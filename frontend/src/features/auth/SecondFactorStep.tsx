import { useState, type SubmitEvent } from 'react';
import { Button } from '../../components/ui/Button';
import { OtpInput } from '../../components/ui/OtpInput';
import { TextField } from '../../components/ui/TextField';
import { Alert } from '../../components/ui/Alert';
import { errorMessage, hasCode } from './errors';
import { useAuth } from './useAuth';
import type { User } from './types';
import './auth.css';

interface SecondFactorStepProps {
  ticket: string;
  onSignedIn: (user: User) => void;
  /** The ticket expired or was burnt: go back to the password step. */
  onRestart: () => void;
}

/** "Enter the 6-digit code" step of sign-in, with a backup-code fallback. */
export function SecondFactorStep({ ticket, onSignedIn, onRestart }: SecondFactorStepProps) {
  const { completeSecondFactor } = useAuth();
  const [code, setCode] = useState('');
  const [useBackup, setUseBackup] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expired, setExpired] = useState(false);

  const submit = async (value: string) => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      onSignedIn(await completeSecondFactor(ticket, value.trim()));
    } catch (err) {
      setError(errorMessage(err));
      if (hasCode(err, 'MFA_TICKET_INVALID')) setExpired(true);
      setCode('');
    } finally {
      setBusy(false);
    }
  };

  const onSubmit = (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    void submit(code);
  };

  if (expired) {
    return (
      <>
        <Alert tone="warning">{error}</Alert>
        <Button variant="primary" block onClick={onRestart}>
          Sign in again
        </Button>
      </>
    );
  }

  return (
    <form onSubmit={onSubmit} noValidate>
      {error && <Alert tone="danger">{error}</Alert>}
      {useBackup ? (
        <TextField
          label="Backup code"
          placeholder="ABCDE-12345"
          autoComplete="one-time-code"
          autoCapitalize="characters"
          spellCheck={false}
          value={code}
          onChange={(e) => {
            setCode(e.target.value);
            setError(null);
          }}
          hint="Each backup code works once."
        />
      ) : (
        <>
          <p className="muted">Open your authenticator app and enter the 6-digit code for Healthmarg.</p>
          <OtpInput
            value={code}
            onChange={(value) => {
              setCode(value);
              setError(null);
            }}
            onComplete={(v) => void submit(v)}
            disabled={busy}
            invalid={Boolean(error)}
          />
        </>
      )}
      <Button type="submit" variant="primary" block loading={busy} disabled={useBackup ? code.trim().length < 10 : code.length !== 6}>
        Verify and continue
      </Button>
      <div className="auth__footer">
        <button
          type="button"
          className="link-button"
          onClick={() => {
            setUseBackup((b) => !b);
            setCode('');
            setError(null);
          }}
        >
          {useBackup ? 'Use my authenticator app instead' : 'Lost your phone? Use a backup code'}
        </button>
      </div>
    </form>
  );
}
