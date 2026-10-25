import { useState, type SubmitEvent } from 'react';
import { Link } from 'react-router';
import { AuthLayout } from '../../components/layout/AuthLayout';
import { Button } from '../../components/ui/Button';
import { TextField } from '../../components/ui/TextField';
import { Alert } from '../../components/ui/Alert';
import { authApi } from '../../features/auth/api';
import { errorMessage } from '../../features/auth/errors';
import { useRecaptcha } from '../../features/auth/useRecaptcha';
import { emailProblem } from '../../features/auth/validation';
import { useFormErrors } from '../../hooks/useFormErrors';

export default function ForgotPasswordPage() {
  const getCaptcha = useRecaptcha();
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const { fieldErrors, setFieldErrors, formError: error, setFormError: setError, edited } = useFormErrors<'email'>();

  const onSubmit = async (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    const problem = emailProblem(email);
    setFieldErrors({ email: problem });
    if (problem) return;
    setBusy(true);
    setError(null);
    try {
      await authApi.forgotPassword(email.trim(), await getCaptcha('forgot_password'));
      setSent(true);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthLayout title="Reset your password" subtitle="Enter your email and we’ll send you a link to choose a new password.">
      {sent ? (
        <>
          <Alert tone="success" title="Check your email">
            If an account exists for <strong>{email.trim()}</strong>, a reset link is on its way. It works once, for 1 hour.
          </Alert>
          {import.meta.env.DEV && (
            <Alert tone="info" title="Local development">
              Open the newest file in <code>backend/.local/outbox/</code>.
            </Alert>
          )}
        </>
      ) : (
        <form onSubmit={(e) => void onSubmit(e)} noValidate>
          {error && <Alert tone="danger">{error}</Alert>}
          <TextField
            label="Email"
            type="email"
            autoComplete="email"
            inputMode="email"
            required
            value={email}
            error={fieldErrors.email}
            onChange={(e) => {
              setEmail(e.target.value);
              edited('email');
            }}
          />
          <Button type="submit" variant="primary" size="lg" block loading={busy}>
            Send reset link
          </Button>
        </form>
      )}
      <p className="auth__footer">
        Remembered it?{' '}
        <Link to="/signin">
          Back to sign in
        </Link>
      </p>
    </AuthLayout>
  );
}
