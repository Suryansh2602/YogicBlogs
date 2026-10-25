import { useState, type SubmitEvent } from 'react';
import { Link, useLocation, useNavigate } from 'react-router';
import { AuthLayout } from '../../components/layout/AuthLayout';
import { Button } from '../../components/ui/Button';
import { TextField } from '../../components/ui/TextField';
import { PasswordField } from '../../components/ui/PasswordField';
import { Alert } from '../../components/ui/Alert';
import { SecondFactorStep } from '../../features/auth/SecondFactorStep';
import { authApi } from '../../features/auth/api';
import { errorMessage, hasCode } from '../../features/auth/errors';
import { useAuth } from '../../features/auth/useAuth';
import { useRecaptcha } from '../../features/auth/useRecaptcha';
import { emailProblem } from '../../features/auth/validation';
import { useFormErrors } from '../../hooks/useFormErrors';
import type { User } from '../../features/auth/types';
import '../../features/auth/auth.css';

/** Only same-app paths are allowed as a post-sign-in destination (no open redirects). */
const safeReturnPath = (value: unknown) =>
  typeof value === 'string' && value.startsWith('/') && !value.startsWith('//') && !value.startsWith('/admin') ? value : '/dashboard';

export default function SignInPage() {
  const { signIn } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const getCaptcha = useRecaptcha();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const { fieldErrors, setFieldErrors, formError: error, setFormError: setError, edited } = useFormErrors<'email' | 'password'>();
  const [unverified, setUnverified] = useState(false);
  const [resent, setResent] = useState(false);
  const [ticket, setTicket] = useState<string | null>(null);

  const done = (user: User) => {
    const from = (location.state as { from?: unknown } | null)?.from;
    void navigate(user.role === 'admin' ? '/admin' : safeReturnPath(from), { replace: true });
  };

  const onSubmit = async (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    const problems = { email: emailProblem(email), password: password ? undefined : 'Enter your password.' };
    setFieldErrors(problems);
    if (problems.email || problems.password) return;
    setBusy(true);
    setError(null);
    setUnverified(false);
    try {
      const outcome = await signIn(email, password, { captchaToken: await getCaptcha('login') });
      if (outcome.kind === 'session') done(outcome.user);
      else setTicket(outcome.ticket);
    } catch (err) {
      setUnverified(hasCode(err, 'EMAIL_NOT_VERIFIED'));
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const resend = async () => {
    try {
      await authApi.resendVerification(email, await getCaptcha('resend_verification'));
      setResent(true);
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  if (ticket) {
    return (
      <AuthLayout title="Two-step sign-in" subtitle="One more step to keep your account safe.">
        <SecondFactorStep
          ticket={ticket}
          onSignedIn={done}
          onRestart={() => {
            setTicket(null);
            setPassword('');
          }}
        />
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      title="Welcome back"
      subtitle={
        <>
          <span className="deva">नमस्ते</span> · Continue on your path to ease.
        </>
      }
    >
      <form onSubmit={(e) => void onSubmit(e)} noValidate>
        {error && (
          <Alert tone={unverified ? 'warning' : 'danger'}>
            {error}
            {unverified &&
              (resent ? (
                <p>A new confirmation link is on its way.</p>
              ) : (
                <p>
                  <button type="button" className="link-button" onClick={() => void resend()}>
                    Send the confirmation link again
                  </button>
                </p>
              ))}
          </Alert>
        )}
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
            setUnverified(false);
          }}
        />
        <PasswordField
          label="Password"
          autoComplete="current-password"
          required
          value={password}
          error={fieldErrors.password}
          onChange={(e) => {
            setPassword(e.target.value);
            edited('password');
            setUnverified(false);
          }}
        />
        <div className="auth__row">
          <span />
          <Link to="/forgot-password">
            Forgot password?
          </Link>
        </div>
        <Button type="submit" variant="primary" size="lg" block loading={busy}>
          Sign in
        </Button>
      </form>
      <p className="auth__footer">
        New to Healthmarg?{' '}
        <Link to="/signup">
          Create a free account
        </Link>
      </p>
    </AuthLayout>
  );
}
