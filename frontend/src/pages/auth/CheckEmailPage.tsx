import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router';
import { AuthLayout } from '../../components/layout/AuthLayout';
import { Button } from '../../components/ui/Button';
import { Alert } from '../../components/ui/Alert';
import { LotusBloom } from '../../components/brand/LotusBloom';
import { authApi } from '../../features/auth/api';
import { errorMessage } from '../../features/auth/errors';
import { useRecaptcha } from '../../features/auth/useRecaptcha';

const COOLDOWN_SECONDS = 60;

export default function CheckEmailPage() {
  const location = useLocation();
  const email = (location.state as { email?: string } | null)?.email;
  const getCaptcha = useRecaptcha();
  const [cooldown, setCooldown] = useState(COOLDOWN_SECONDS);
  const [notice, setNotice] = useState<{ tone: 'success' | 'danger'; text: string } | null>(null);

  useEffect(() => {
    if (cooldown <= 0) return undefined;
    const timer = setTimeout(() => {
      setCooldown((c) => c - 1);
    }, 1000);
    return () => {
      clearTimeout(timer);
    };
  }, [cooldown]);

  const resend = async () => {
    if (!email) return;
    try {
      await authApi.resendVerification(email, await getCaptcha('resend_verification'));
      setNotice({ tone: 'success', text: 'Sent again. It can take a minute to arrive.' });
      setCooldown(COOLDOWN_SECONDS);
    } catch (err) {
      setNotice({ tone: 'danger', text: errorMessage(err) });
    }
  };

  return (
    <AuthLayout title="Check your email" subtitle={null}>
      <div className="center-stack">
        <LotusBloom size={120} />
        <p>
          We’ve sent a confirmation link to {email ? <strong>{email}</strong> : 'your email address'}. Open it to activate your
          account. The link works for 24 hours.
        </p>
        <p className="muted">Can’t find it? Look in Spam or Promotions.</p>
        {import.meta.env.DEV && (
          <Alert tone="info" title="Local development">
            Emails aren’t sent locally. Open the newest file in <code>backend/.local/outbox/</code> (or click the link printed in
            the API terminal).
          </Alert>
        )}
        {notice && <Alert tone={notice.tone}>{notice.text}</Alert>}
        {email && (
          <Button variant="secondary" block disabled={cooldown > 0} onClick={() => void resend()}>
            {cooldown > 0 ? `Send again in ${cooldown}s` : 'Send the link again'}
          </Button>
        )}
        <p className="auth__footer">
          Confirmed already?{' '}
          <Link to="/signin">
            Sign in
          </Link>
        </p>
      </div>
    </AuthLayout>
  );
}
