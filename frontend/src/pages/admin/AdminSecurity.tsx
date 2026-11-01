import { useState, type SubmitEvent } from 'react';
import { Alert } from '../../components/ui/Alert';
import { Button } from '../../components/ui/Button';
import { PasswordField } from '../../components/ui/PasswordField';
import { Spinner } from '../../components/ui/Spinner';
import { TextField } from '../../components/ui/TextField';
import { adminApi, type SetupCodeInfo } from '../../features/auth/api';
import { errorMessage, fieldErrors } from '../../features/auth/errors';
import { useFormErrors } from '../../hooks/useFormErrors';
import { useAdminData } from './useAdminData';

type Field = 'password' | 'totpCode' | 'newCode' | 'confirmCode';

const SOURCE_TEXT: Record<SetupCodeInfo['source'], string> = {
  panel: 'Set here, in the Admin panel.',
  env: 'ADMIN_SETUP_CODE from the server’s backend/.env (the fallback).',
  none: 'Not set. Recovery won’t work until a code is set.',
};

/** A strong random code: 32 characters, letters, digits, - and _ (192 bits). */
export function generateSetupCode() {
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  return btoa(String.fromCharCode(...bytes)).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
}

const when = (iso: string) => new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' });

/** Admin → Security: the setup code (change it, or go back to the .env one), and wrong codes tried. */
export default function AdminSecurity() {
  const [reloadKey, setReloadKey] = useState(0);
  const overview = useAdminData(() => adminApi.security(), [reloadKey]);
  const [password, setPassword] = useState('');
  const [totpCode, setTotpCode] = useState('');
  const [newCode, setNewCode] = useState('');
  const [confirmCode, setConfirmCode] = useState('');
  const [generated, setGenerated] = useState(false);
  const [copied, setCopied] = useState(false);
  const { fieldErrors: errors, setFieldErrors: setErrors, formError, setFormError, edited } = useFormErrors<Field>();
  const [busy, setBusy] = useState<'change' | 'remove' | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const proofProblems = () => ({
    password: password ? undefined : 'Enter your password.',
    totpCode: /^\d{6}$/.test(totpCode.trim()) ? undefined : 'Enter the 6-digit code from your authenticator app.',
  });

  const done = (message: string) => {
    setNotice(message);
    setPassword('');
    setTotpCode('');
    setNewCode('');
    setConfirmCode('');
    setGenerated(false);
    setReloadKey((k) => k + 1);
  };

  const fail = (err: unknown) => {
    const fields = fieldErrors(err);
    if (Object.keys(fields).length) setErrors(fields);
    else setFormError(errorMessage(err));
  };

  const change = async (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    setNotice(null);
    const next = {
      ...proofProblems(),
      newCode: newCode.length < 24 ? 'Use at least 24 characters (Generate makes a strong one).' : /\s/.test(newCode) ? 'The setup code can’t contain spaces.' : undefined,
      confirmCode: confirmCode === newCode ? undefined : 'The two codes don’t match.',
    };
    setErrors(next);
    if (Object.values(next).some(Boolean)) return;
    setBusy('change');
    setFormError(null);
    try {
      await adminApi.changeSetupCode({ password, totpCode: totpCode.trim(), newCode });
      done('Setup code changed. It works from now on; the old code no longer does. Keep the new one somewhere safe.');
    } catch (err) {
      fail(err);
    } finally {
      setBusy(null);
    }
  };

  const remove = async () => {
    setNotice(null);
    const next = proofProblems();
    setErrors(next);
    if (Object.values(next).some(Boolean)) return;
    setBusy('remove');
    setFormError(null);
    try {
      await adminApi.removeSetupCode({ password, totpCode: totpCode.trim() });
      done('The panel code was removed. ADMIN_SETUP_CODE from backend/.env counts again.');
    } catch (err) {
      fail(err);
    } finally {
      setBusy(null);
    }
  };

  return (
    <>
      <header className="admin__header">
        <p className="eyebrow">
          <span className="deva">सुरक्षा</span> · Security
        </p>
        <h1>Setup code</h1>
        <p className="muted">
          The setup code proves the server owner: it creates the first admin and recovers the admin account (a forgotten email or
          password, a lost 2FA phone). Anyone with it can recover the admin account, so keep it secret.
        </p>
      </header>

      {overview.status === 'loading' && <Spinner size={28} label="Loading security settings" />}
      {overview.status === 'error' && <Alert tone="danger">{overview.message}</Alert>}
      {overview.status === 'ready' && (
        <dl className="security-facts">
          <div>
            <dt>Code in use</dt>
            <dd>{SOURCE_TEXT[overview.data.setupCode.source]}</dd>
          </div>
          {overview.data.setupCode.changedAt && (
            <div>
              <dt>Last changed</dt>
              <dd>
                {when(overview.data.setupCode.changedAt)}
                {overview.data.setupCode.changedBy ? ` by ${overview.data.setupCode.changedBy}` : ''}
              </dd>
            </div>
          )}
          <div>
            <dt>Wrong codes tried (last 24 hours)</dt>
            <dd className={overview.data.failedCodeAttempts24h > 0 ? 'security-facts__warn' : undefined}>
              {overview.data.failedCodeAttempts24h}
              {overview.data.failedCodeAttempts24h > 0 && ' · see the Audit log (admin.recovery.failure) and change the code if they weren’t you.'}
            </dd>
          </div>
        </dl>
      )}

      {notice && <Alert tone="success">{notice}</Alert>}

      <form className="admin-form security-form" onSubmit={(e) => void change(e)} noValidate>
        <h2>Change the setup code</h2>
        {formError && <Alert tone="danger">{formError}</Alert>}
        <PasswordField
          label="Your password"
          autoComplete="current-password"
          required
          value={password}
          error={errors.password}
          onChange={(e) => {
            setPassword(e.target.value);
            edited('password');
          }}
        />
        <TextField
          label="Code from your authenticator app"
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={6}
          required
          value={totpCode}
          error={errors.totpCode}
          onChange={(e) => {
            setTotpCode(e.target.value.replace(/\D/g, ''));
            edited('totpCode');
          }}
        />
        <div className="security-form__generate">
          <Button
            type="button"
            variant="secondary"
            onClick={() => {
              const code = generateSetupCode();
              setNewCode(code);
              setConfirmCode(code);
              setGenerated(true);
              setCopied(false);
              edited('newCode');
              edited('confirmCode');
            }}
          >
            Generate a strong code
          </Button>
          {generated && (
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                void navigator.clipboard.writeText(newCode).then(() => {
                  setCopied(true);
                });
              }}
            >
              {copied ? 'Copied' : 'Copy the code'}
            </Button>
          )}
        </div>
        {generated && (
          <Alert tone="warning">Save this code in your password manager now. It is shown only here; after saving, nobody can read it back.</Alert>
        )}
        <TextField
          label="New setup code"
          spellCheck={false}
          autoComplete="off"
          required
          value={newCode}
          error={errors.newCode}
          hint="At least 24 characters, no spaces, not your password."
          onChange={(e) => {
            setNewCode(e.target.value);
            setGenerated(false);
            edited('newCode');
          }}
        />
        <TextField
          label="New setup code again"
          spellCheck={false}
          autoComplete="off"
          required
          value={confirmCode}
          error={errors.confirmCode}
          onChange={(e) => {
            setConfirmCode(e.target.value);
            edited('confirmCode');
          }}
        />
        <div className="security-form__actions">
          <Button type="submit" loading={busy === 'change'}>
            Change setup code
          </Button>
          {overview.status === 'ready' && overview.data.setupCode.source === 'panel' && (
            <Button type="button" variant="ghost" loading={busy === 'remove'} onClick={() => void remove()}>
              Use the .env code instead
            </Button>
          )}
        </div>
      </form>
    </>
  );
}
