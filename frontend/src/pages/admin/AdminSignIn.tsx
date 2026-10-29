import { useCallback, useEffect, useState, type SubmitEvent } from 'react';
import { Link } from 'react-router';
import { AuthLayout } from '../../components/layout/AuthLayout';
import { Button } from '../../components/ui/Button';
import { TextField } from '../../components/ui/TextField';
import { PasswordField } from '../../components/ui/PasswordField';
import { Alert } from '../../components/ui/Alert';
import { SecondFactorStep } from '../../features/auth/SecondFactorStep';
import { TwoFactorEnrolment } from '../../features/auth/TwoFactorEnrolment';
import { activatePendingSession } from '../../features/auth/session';
import { adminApi } from '../../features/auth/api';
import { errorMessage } from '../../features/auth/errors';
import { useAuth } from '../../features/auth/useAuth';
import { useRecaptcha } from '../../features/auth/useRecaptcha';
import { emailProblem } from '../../features/auth/validation';
import { useFormErrors } from '../../hooks/useFormErrors';

const ADMIN_VERSE = {
  sanskrit: 'धर्मो रक्षति रक्षितः',
  transliteration: 'dharmo rakṣati rakṣitaḥ',
  meaning: 'What we protect, protects us in turn. (Manusmṛti 8.15)',
};

type Step = { kind: 'password' } | { kind: 'code'; ticket: string } | { kind: 'enrol'; ticket: string };

/** /admin when not signed in as an admin: password → (first time) 2FA enrolment, or 2FA code. */
export default function AdminSignIn() {
  const { signIn, beginTicketEnrolment, enableTicketEnrolment, user } = useAuth();
  const getCaptcha = useRecaptcha();
  const [step, setStep] = useState<Step>({ kind: 'password' });
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const { fieldErrors, setFieldErrors, formError: error, setFormError: setError, edited } = useFormErrors<'email' | 'password'>();
  const [setupRequired, setSetupRequired] = useState(false);

  useEffect(() => {
    adminApi.setupStatus().then(
      (s) => {
        setSetupRequired(s.setupRequired);
      },
      () => undefined,
    );
  }, []);

  const restart = useCallback(
    (message?: string) => {
      setStep({ kind: 'password' });
      setPassword('');
      setError(message ?? 'Your sign-in attempt expired. Please sign in again.');
    },
    [setError],
  );

  const ticket = step.kind === 'password' ? '' : step.ticket;
  const begin = useCallback(() => beginTicketEnrolment(ticket), [beginTicketEnrolment, ticket]);
  const enable = useCallback((code: string) => enableTicketEnrolment(ticket, code), [enableTicketEnrolment, ticket]);

  const onSubmit = async (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    const problems = { email: emailProblem(email), password: password ? undefined : 'Enter your password.' };
    setFieldErrors(problems);
    if (problems.email || problems.password) return;
    setBusy(true);
    setError(null);
    try {
      const outcome = await signIn(email, password, { admin: true, captchaToken: await getCaptcha('admin_login') });
      if (outcome.kind === 'mfa') setStep({ kind: 'code', ticket: outcome.ticket });
      else if (outcome.kind === 'mfaSetup') setStep({ kind: 'enrol', ticket: outcome.ticket });
      // A finished session can't happen for admins (2FA is mandatory); the gate re-renders if it does.
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  if (step.kind === 'enrol') {
    return (
      <AuthLayout title="Secure your admin account" subtitle="Admins must use two-step sign-in. This takes a minute, once." verse={ADMIN_VERSE}>
        <TwoFactorEnrolment begin={begin} enable={enable} onDone={activatePendingSession} onExpired={restart} />
      </AuthLayout>
    );
  }

  if (step.kind === 'code') {
    return (
      <AuthLayout title="Two-step sign-in" subtitle="Enter the code from your authenticator app." verse={ADMIN_VERSE}>
        <SecondFactorStep
          ticket={step.ticket}
          onSignedIn={() => undefined}
          onRestart={() => {
            restart();
          }}
        />
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      title="Admin sign-in"
      subtitle={
        <>
          <span className="deva">प्रबन्धन</span> · For the Healthmarg team only.
        </>
      }
      verse={ADMIN_VERSE}
    >
      {user && user.role !== 'admin' && (
        <Alert tone="info">
          You’re signed in as a member. <Link to="/dashboard">Go to your dashboard</Link>, or sign in below with an admin
          account.
        </Alert>
      )}
      {setupRequired && (
        <Alert tone="warning" title="No admin account yet">
          <Link to="/admin/setup">Create the first admin account</Link> with the setup code from the server.
        </Alert>
      )}
      <form onSubmit={(e) => void onSubmit(e)} noValidate>
        {error && <Alert tone="danger">{error}</Alert>}
        <TextField
          label="Admin email"
          type="email"
          autoComplete="username"
          required
          value={email}
          error={fieldErrors.email}
          onChange={(e) => {
            setEmail(e.target.value);
            edited('email');
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
          }}
        />
        <Button type="submit" variant="primary" size="lg" block loading={busy}>
          Continue
        </Button>
        <p className="muted center-text">
          Can’t sign in? <Link to="/admin/recover">Recover the admin account</Link> with the server’s setup code.
        </p>
      </form>
    </AuthLayout>
  );
}
