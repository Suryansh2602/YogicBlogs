import { useEffect, useState } from 'react';
import { Button } from '../../components/ui/Button';
import { OtpInput } from '../../components/ui/OtpInput';
import { Alert } from '../../components/ui/Alert';
import { Checkbox } from '../../components/ui/Checkbox';
import { Spinner } from '../../components/ui/Spinner';
import { LotusBloom } from '../../components/brand/LotusBloom';
import { errorMessage, hasCode } from './errors';
import type { TwoFactorSetup } from './types';
import './auth.css';

interface TwoFactorEnrolmentProps {
  /** Fetch a new secret + QR code. */
  begin: () => Promise<TwoFactorSetup>;
  /** Confirm the first code; resolves to the backup codes. */
  enable: (code: string) => Promise<string[]>;
  /** Called after the user confirms the backup codes are saved. */
  onDone: () => void;
  /** The pending sign-in expired (admin first sign-in only). */
  onExpired?: () => void;
}

const groups = (secret: string) => secret.match(/.{1,4}/g)?.join(' ') ?? secret;

/**
 * Turn on two-step sign-in: scan the QR code (or type the key), confirm a code, then save the backup
 * codes. Used for an admin's mandatory first-time setup and for users who opt in from their dashboard.
 */
export function TwoFactorEnrolment({ begin, enable, onDone, onExpired }: TwoFactorEnrolmentProps) {
  const [setup, setSetup] = useState<TwoFactorSetup | null>(null);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [backupCodes, setBackupCodes] = useState<string[] | null>(null);
  const [saved, setSaved] = useState(false);
  const [showKey, setShowKey] = useState(false);

  useEffect(() => {
    let cancelled = false;
    begin().then(
      (result) => {
        if (!cancelled) setSetup(result);
      },
      (err: unknown) => {
        if (cancelled) return;
        if (hasCode(err, 'MFA_TICKET_INVALID')) onExpired?.();
        setError(errorMessage(err));
      },
    );
    return () => {
      cancelled = true;
    };
  }, [begin, onExpired]);

  const confirm = async (value: string) => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      setBackupCodes(await enable(value));
    } catch (err) {
      if (hasCode(err, 'MFA_TICKET_INVALID')) onExpired?.();
      setError(errorMessage(err));
      setCode('');
    } finally {
      setBusy(false);
    }
  };

  const download = () => {
    if (!backupCodes) return;
    const text = `Healthmarg backup codes\nEach code works once. Keep them somewhere safe and private.\n\n${backupCodes.join('\n')}\n`;
    const url = URL.createObjectURL(new Blob([text], { type: 'text/plain' }));
    const link = Object.assign(document.createElement('a'), { href: url, download: 'healthmarg-backup-codes.txt' });
    link.click();
    URL.revokeObjectURL(url);
  };

  if (backupCodes) {
    return (
      <div className="enrol enrol--done">
        <LotusBloom size={110} label="Two-step sign-in is on" />
        <h2 className="enrol__title">Your account is protected</h2>
        <p className="muted">
          Save these backup codes. If you lose your phone, each one lets you sign in once. They won’t be shown again.
        </p>
        <ol className="backup-codes">
          {backupCodes.map((c) => (
            <li key={c}>
              <code>{c}</code>
            </li>
          ))}
        </ol>
        <div className="enrol__actions">
          <Button variant="secondary" size="sm" onClick={download}>
            Download as text
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => {
              void navigator.clipboard.writeText(backupCodes.join('\n'));
            }}
          >
            Copy
          </Button>
        </div>
        <Checkbox
          checked={saved}
          onChange={(e) => {
            setSaved(e.target.checked);
          }}
        >
          I’ve saved my backup codes somewhere safe
        </Checkbox>
        <Button variant="primary" block disabled={!saved} onClick={onDone}>
          Continue
        </Button>
      </div>
    );
  }

  return (
    <div className="enrol">
      {error && <Alert tone="danger">{error}</Alert>}
      {!setup && !error && (
        <div className="enrol__loading">
          <Spinner size={28} label="Preparing your QR code" />
        </div>
      )}
      {setup && (
        <>
          <ol className="enrol__steps">
            <li>
              Install an authenticator app (Google Authenticator, Microsoft Authenticator, Authy or similar).
            </li>
            <li>Scan this QR code with it.</li>
          </ol>
          <div className="enrol__qr">
            <img src={setup.qrDataUrl} alt="QR code for your authenticator app" width={200} height={200} />
          </div>
          <div className="enrol__key">
            {showKey ? (
              <>
                <span className="muted">Can’t scan? Type this key:</span>
                <code className="enrol__secret">{groups(setup.secret)}</code>
              </>
            ) : (
              <button
                type="button"
                className="link-button"
                onClick={() => {
                  setShowKey(true);
                }}
              >
                Can’t scan the code?
              </button>
            )}
          </div>
          <p className="enrol__prompt">3. Enter the 6-digit code the app shows:</p>
          <OtpInput value={code} onChange={setCode} onComplete={(v) => void confirm(v)} disabled={busy} invalid={Boolean(error)} />
          <Button variant="primary" block loading={busy} disabled={code.length !== 6} onClick={() => void confirm(code)}>
            Turn on two-step sign-in
          </Button>
        </>
      )}
    </div>
  );
}
