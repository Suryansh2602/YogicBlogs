import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { AuthLayout } from '../../components/layout/AuthLayout';
import { Alert } from '../../components/ui/Alert';
import { Spinner } from '../../components/ui/Spinner';
import { LotusBloom } from '../../components/brand/LotusBloom';
import { authApi } from '../../features/auth/api';
import { errorMessage } from '../../features/auth/errors';
import { useUrlToken } from './useUrlToken';

// The link is single-use, so the request must be sent exactly once per token, even when React runs
// effects twice in development (StrictMode) or the component remounts.
const attempts = new Map<string, Promise<unknown>>();

type State = { kind: 'working' } | { kind: 'done' } | { kind: 'failed'; message: string };

export default function VerifyEmailPage() {
  const token = useUrlToken();
  const [state, setState] = useState<State>(() =>
    token ? { kind: 'working' } : { kind: 'failed', message: 'This confirmation link is incomplete. Please use the full link from the email.' },
  );

  useEffect(() => {
    if (!token) return;
    let attempt = attempts.get(token);
    if (!attempt) {
      attempt = authApi.verifyEmail(token);
      attempts.set(token, attempt);
    }
    attempt.then(
      () => {
        setState({ kind: 'done' });
      },
      (err: unknown) => {
        setState({ kind: 'failed', message: errorMessage(err) });
      },
    );
  }, [token]);

  return (
    <AuthLayout title={state.kind === 'done' ? 'Email confirmed' : 'Confirming your email'}>
      <div className="center-stack" aria-live="polite">
        {state.kind === 'working' && <Spinner size={36} label="Confirming your email" />}
        {state.kind === 'done' && (
          <>
            <LotusBloom size={140} label="Confirmed" />
            <p>Your account is active. Welcome to Healthmarg.</p>
            <Link to="/signin" className="btn btn--primary btn--lg btn--block">
              <span className="btn__label">Sign in</span>
            </Link>
          </>
        )}
        {state.kind === 'failed' && (
          <>
            <Alert tone="danger">{state.message}</Alert>
            <p className="muted">
              Links expire after 24 hours and work once. Sign in with your email and password and we’ll offer to send a new
              one.
            </p>
            <Link to="/signin" className="btn btn--secondary btn--block">
              <span className="btn__label">Go to sign in</span>
            </Link>
          </>
        )}
      </div>
    </AuthLayout>
  );
}
