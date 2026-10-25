import { useEffect, useState, type SubmitEvent } from 'react';
import { Link } from 'react-router';
import { AuthLayout } from '../../components/layout/AuthLayout';
import { Button } from '../../components/ui/Button';
import { TextField } from '../../components/ui/TextField';
import { PasswordField } from '../../components/ui/PasswordField';
import { Alert } from '../../components/ui/Alert';
import { Spinner } from '../../components/ui/Spinner';
import { LotusBloom } from '../../components/brand/LotusBloom';
import { adminApi } from '../../features/auth/api';
import { errorMessage, fieldErrors } from '../../features/auth/errors';
import { passwordProblems } from '../../features/auth/passwordPolicy';

/** One-time creation of the first admin. Closed for good once any admin exists (enforced by the API). */
export default function AdminSetupPage() {
  const [status, setStatus] = useState<'loading' | 'open' | 'closed'>('loading');
  const [setupCode, setSetupCode] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<Record<string, string | undefined>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [created, setCreated] = useState(false);

  useEffect(() => {
    adminApi.setupStatus().then(
      (s) => {
        setStatus(s.setupRequired ? 'open' : 'closed');
      },
      (err: unknown) => {
        setFormError(errorMessage(err));
        setStatus('closed');
      },
    );
  }, []);

  const onSubmit = async (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    const problem = passwordProblems(password, { email, displayName })[0];
    if (problem) {
      setErrors({ password: problem });
      return;
    }
    setBusy(true);
    setErrors({});
    setFormError(null);
    try {
      await adminApi.setup({ setupCode: setupCode.trim(), email: email.trim(), password, displayName: displayName.trim() });
      setCreated(true);
    } catch (err) {
      setErrors(fieldErrors(err));
      setFormError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  if (status === 'loading') {
    return (
      <AuthLayout title="Admin setup">
        <div className="center-stack">
          <Spinner size={32} label="Checking setup status" />
        </div>
      </AuthLayout>
    );
  }

  if (created) {
    return (
      <AuthLayout title="Admin account created">
        <div className="center-stack">
          <LotusBloom size={130} label="Created" />
          <p>Next, sign in. You’ll set up two-step sign-in with an authenticator app on your phone.</p>
          <Link to="/admin" className="btn btn--primary btn--lg btn--block">
            <span className="btn__label">Go to admin sign-in</span>
          </Link>
        </div>
      </AuthLayout>
    );
  }

  if (status === 'closed') {
    return (
      <AuthLayout title="Admin setup">
        {formError ? <Alert tone="danger">{formError}</Alert> : <Alert tone="info">Setup is already complete.</Alert>}
        <Link to="/admin" className="btn btn--primary btn--block">
          <span className="btn__label">Go to admin sign-in</span>
        </Link>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      title="Create the first admin"
      subtitle="This page works only once, while Healthmarg has no admin. You need the setup code from the server."
    >
      <form onSubmit={(e) => void onSubmit(e)} noValidate>
        {formError && <Alert tone="danger">{formError}</Alert>}
        <TextField
          label="Setup code"
          autoComplete="off"
          spellCheck={false}
          required
          value={setupCode}
          error={errors['setupCode']}
          hint="Shown in the API terminal at startup (or ADMIN_SETUP_CODE in the server settings)."
          onChange={(e) => {
            setSetupCode(e.target.value);
          }}
        />
        <TextField
          label="Your name"
          autoComplete="name"
          required
          value={displayName}
          error={errors['displayName']}
          onChange={(e) => {
            setDisplayName(e.target.value);
          }}
        />
        <TextField
          label="Admin email"
          type="email"
          autoComplete="username"
          required
          value={email}
          error={errors['email']}
          onChange={(e) => {
            setEmail(e.target.value);
          }}
        />
        <PasswordField
          label="Password"
          autoComplete="new-password"
          showStrength
          required
          value={password}
          error={errors['password']}
          onChange={(e) => {
            setPassword(e.target.value);
          }}
        />
        <Button type="submit" variant="primary" size="lg" block loading={busy} disabled={!setupCode || !email || !password || !displayName}>
          Create admin account
        </Button>
      </form>
    </AuthLayout>
  );
}
