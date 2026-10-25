import { useState, type SubmitEvent } from 'react';
import { Link } from 'react-router';
import { AuthLayout } from '../../components/layout/AuthLayout';
import { Button } from '../../components/ui/Button';
import { PasswordField } from '../../components/ui/PasswordField';
import { Alert } from '../../components/ui/Alert';
import { LotusBloom } from '../../components/brand/LotusBloom';
import { authApi } from '../../features/auth/api';
import { errorMessage, fieldErrors } from '../../features/auth/errors';
import { passwordProblems } from '../../features/auth/passwordPolicy';
import { useUrlToken } from './useUrlToken';

export default function ResetPasswordPage() {
  const token = useUrlToken();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [errors, setErrors] = useState<{ password?: string | undefined; confirm?: string | undefined }>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  const onSubmit = async (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!token) return;
    const problem = passwordProblems(password)[0];
    const next = { password: problem, confirm: password !== confirm ? 'The two passwords don’t match' : undefined };
    setErrors(next);
    if (next.password || next.confirm) return;
    setBusy(true);
    setFormError(null);
    try {
      await authApi.resetPassword(token, password);
      setDone(true);
    } catch (err) {
      setErrors({ password: fieldErrors(err)['password'] });
      setFormError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  if (!token) {
    return (
      <AuthLayout title="Reset your password">
        <Alert tone="danger">This reset link is incomplete or invalid. Please request a new one.</Alert>
        <Link to="/forgot-password" className="btn btn--primary btn--block">
          <span className="btn__label">Request a new link</span>
        </Link>
      </AuthLayout>
    );
  }

  if (done) {
    return (
      <AuthLayout title="Password changed">
        <div className="center-stack">
          <LotusBloom size={130} label="Password changed" />
          <p>Your new password is set, and you’ve been signed out everywhere else for safety.</p>
          <Link to="/signin" className="btn btn--primary btn--lg btn--block">
            <span className="btn__label">Sign in</span>
          </Link>
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout title="Choose a new password" subtitle="Make it at least 12 characters. A short phrase works well.">
      <form onSubmit={(e) => void onSubmit(e)} noValidate>
        {formError && <Alert tone="danger">{formError}</Alert>}
        <PasswordField
          label="New password"
          autoComplete="new-password"
          showStrength
          maxLength={128}
          value={password}
          error={errors.password}
          onChange={(e) => {
            setPassword(e.target.value);
          }}
        />
        <PasswordField
          label="Repeat new password"
          autoComplete="new-password"
          maxLength={128}
          value={confirm}
          error={errors.confirm}
          onChange={(e) => {
            setConfirm(e.target.value);
          }}
        />
        <Button type="submit" variant="primary" size="lg" block loading={busy}>
          Save new password
        </Button>
      </form>
    </AuthLayout>
  );
}
