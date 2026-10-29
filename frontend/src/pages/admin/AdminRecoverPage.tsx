import { useState, type SubmitEvent } from 'react';
import { Link } from 'react-router';
import { AuthLayout } from '../../components/layout/AuthLayout';
import { Button } from '../../components/ui/Button';
import { TextField } from '../../components/ui/TextField';
import { PasswordField } from '../../components/ui/PasswordField';
import { Alert } from '../../components/ui/Alert';
import { LotusBloom } from '../../components/brand/LotusBloom';
import { adminApi, type RecoverableAdmin } from '../../features/auth/api';
import { errorMessage, fieldErrors } from '../../features/auth/errors';
import { passwordProblems } from '../../features/auth/passwordPolicy';
import { useFormErrors } from '../../hooks/useFormErrors';

type Field = 'setupCode' | 'password';

/**
 * Admin recovery with the server's setup code (ADMIN_SETUP_CODE): find a forgotten admin email, set a
 * new password, and set up two-step sign-in again. All sessions are signed out. See docs/admin-recovery.md.
 */
export default function AdminRecoverPage() {
  const [setupCode, setSetupCode] = useState('');
  const [admins, setAdmins] = useState<RecoverableAdmin[] | null>(null);
  const [chosen, setChosen] = useState<string>('');
  const [password, setPassword] = useState('');
  const { fieldErrors: errors, setFieldErrors: setErrors, formError, setFormError, edited } = useFormErrors<Field>();
  const [busy, setBusy] = useState(false);
  const [recoveredEmail, setRecoveredEmail] = useState<string | null>(null);

  const showError = (err: unknown) => {
    const fields = fieldErrors(err);
    if (Object.keys(fields).length) setErrors(fields);
    else setFormError(errorMessage(err));
  };

  const lookUp = async (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    const code = setupCode.trim();
    setErrors({ setupCode: code ? undefined : 'Enter the setup code (ADMIN_SETUP_CODE in the server settings).' });
    if (!code) return;
    setBusy(true);
    setFormError(null);
    try {
      const { admins: found } = await adminApi.recoveryLookup(code);
      setAdmins(found);
      setChosen(found[0]?.id ?? '');
    } catch (err) {
      showError(err);
    } finally {
      setBusy(false);
    }
  };

  const recover = async (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    const admin = admins?.find((a) => a.id === chosen);
    if (!admin) return;
    const problem = passwordProblems(password, { email: admin.email, displayName: admin.displayName })[0];
    setErrors({ password: problem });
    if (problem) return;
    setBusy(true);
    setFormError(null);
    try {
      const { email } = await adminApi.recover({ setupCode: setupCode.trim(), adminId: admin.id, password });
      setRecoveredEmail(email);
    } catch (err) {
      showError(err);
    } finally {
      setBusy(false);
    }
  };

  if (recoveredEmail) {
    return (
      <AuthLayout title="Admin account recovered">
        <div className="center-stack">
          <LotusBloom size={130} label="Recovered" />
          <p>
            Sign in with <strong>{recoveredEmail}</strong> and your new password. You’ll set up two-step sign-in again with
            your authenticator app. Every earlier session has been signed out.
          </p>
          <Link to="/admin" className="btn btn--primary btn--lg btn--block">
            <span className="btn__label">Go to admin sign-in</span>
          </Link>
        </div>
      </AuthLayout>
    );
  }

  if (admins) {
    return (
      <AuthLayout title="Choose the account and a new password" subtitle="Two-step sign-in is set up again at the next sign-in.">
        <form onSubmit={(e) => void recover(e)} noValidate>
          {formError && <Alert tone="danger">{formError}</Alert>}
          {admins.length === 0 ? (
            <Alert tone="info">
              There is no admin account yet. <Link to="/admin/setup">Create the first admin</Link> instead.
            </Alert>
          ) : (
            <fieldset className="recover-accounts">
              <legend>Admin account</legend>
              {admins.map((a) => (
                <label key={a.id} className="recover-account">
                  <input
                    type="radio"
                    name="admin"
                    value={a.id}
                    checked={chosen === a.id}
                    onChange={() => {
                      setChosen(a.id);
                    }}
                  />
                  <span>
                    <strong>{a.email}</strong>
                    <span className="muted"> · {a.displayName}</span>
                  </span>
                </label>
              ))}
            </fieldset>
          )}
          {admins.length > 0 && (
            <>
              <PasswordField
                label="New password"
                autoComplete="new-password"
                showStrength
                required
                value={password}
                error={errors.password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  edited('password');
                }}
              />
              <Button type="submit" variant="primary" size="lg" block loading={busy}>
                Recover this account
              </Button>
            </>
          )}
        </form>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      title="Recover the admin account"
      subtitle="Forgot the admin email or password, or lost the phone with two-step sign-in? You need the setup code from the server."
    >
      <form onSubmit={(e) => void lookUp(e)} noValidate>
        {formError && <Alert tone="danger">{formError}</Alert>}
        <TextField
          label="Setup code"
          autoComplete="off"
          spellCheck={false}
          required
          value={setupCode}
          error={errors.setupCode}
          hint="ADMIN_SETUP_CODE in the server settings. Keep it secret: anyone with it can recover the admin account."
          onChange={(e) => {
            setSetupCode(e.target.value);
            edited('setupCode');
          }}
        />
        <Button type="submit" variant="primary" size="lg" block loading={busy}>
          Continue
        </Button>
        <p className="muted center-text">
          <Link to="/admin">Back to admin sign-in</Link>
        </p>
      </form>
    </AuthLayout>
  );
}
