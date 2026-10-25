import { useCallback, useState, type SubmitEvent } from 'react';
import { useNavigate } from 'react-router';
import { SpotlightCard } from '../../components/motion/SpotlightCard';
import { BlurReveal } from '../../components/motion/BlurReveal';
import { Mandala } from '../../components/brand/Mandala';
import { Button } from '../../components/ui/Button';
import { TextField } from '../../components/ui/TextField';
import { Alert } from '../../components/ui/Alert';
import { TwoFactorEnrolment } from '../../features/auth/TwoFactorEnrolment';
import { authApi, usersApi } from '../../features/auth/api';
import { errorMessage, fieldErrors } from '../../features/auth/errors';
import { clearSession } from '../../features/auth/session';
import { useAuth } from '../../features/auth/useAuth';
import type { User } from '../../features/auth/types';
import { greeting, verseOfTheDay } from './wisdom';
import './dashboard.css';

function ProfileCard({ user }: { user: User }) {
  const { updateUser } = useAuth();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(user.displayName);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | undefined>();

  const save = async (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);
    setError(undefined);
    try {
      updateUser((await usersApi.updateMe(name.trim())).user);
      setEditing(false);
    } catch (err) {
      setError(fieldErrors(err)['displayName'] ?? errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <SpotlightCard className="dash-card">
      <h2 className="dash-card__title">Your profile</h2>
      {editing ? (
        <form onSubmit={(e) => void save(e)}>
          <TextField
            label="Name"
            value={name}
            maxLength={80}
            error={error}
            autoFocus
            onChange={(e) => {
              setName(e.target.value);
            }}
          />
          <div className="dash-card__actions">
            <Button type="submit" size="sm" loading={busy} disabled={!name.trim()}>
              Save
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setEditing(false);
                setName(user.displayName);
              }}
            >
              Cancel
            </Button>
          </div>
        </form>
      ) : (
        <>
          <dl className="dash-list">
            <div>
              <dt>Name</dt>
              <dd>{user.displayName}</dd>
            </div>
            <div>
              <dt>Email</dt>
              <dd>
                {user.email} {user.emailVerified && <span className="badge badge--ok">Verified</span>}
              </dd>
            </div>
            <div>
              <dt>Member since</dt>
              <dd>{new Date(user.createdAt).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })}</dd>
            </div>
          </dl>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => {
              setEditing(true);
            }}
          >
            Edit name
          </Button>
        </>
      )}
    </SpotlightCard>
  );
}

function SecurityCard({ user }: { user: User }) {
  const { updateUser } = useAuth();
  const navigate = useNavigate();
  const [enrolling, setEnrolling] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const begin = useCallback(() => authApi.beginEnrolment(), []);
  const enable = useCallback(async (code: string) => (await authApi.enableTwoFactor(code)).backupCodes, []);

  const signOutEverywhere = async () => {
    setBusy(true);
    setError(null);
    try {
      await authApi.logoutEverywhere();
      clearSession();
      void navigate('/signin', { replace: true });
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  };

  return (
    <SpotlightCard className="dash-card">
      <h2 className="dash-card__title">Security</h2>
      {error && <Alert tone="danger">{error}</Alert>}
      {enrolling ? (
        <TwoFactorEnrolment
          begin={begin}
          enable={enable}
          onDone={() => {
            setEnrolling(false);
            updateUser({ ...user, twoFactorEnabled: true });
          }}
        />
      ) : (
        <>
          <div className="security-row">
            <div>
              <strong>Two-step sign-in</strong>
              <p className="muted">
                {user.twoFactorEnabled
                  ? 'On. Signing in needs your password and a code from your phone.'
                  : 'Add a code from your phone at sign-in, so a stolen password alone isn’t enough.'}
              </p>
            </div>
            {user.twoFactorEnabled ? (
              <span className="badge badge--ok">On</span>
            ) : (
              <Button
                size="sm"
                onClick={() => {
                  setEnrolling(true);
                }}
              >
                Turn on
              </Button>
            )}
          </div>
          <div className="security-row">
            <div>
              <strong>Signed in somewhere else?</strong>
              <p className="muted">Sign out of Healthmarg on every device, including this one.</p>
            </div>
            <Button variant="danger" size="sm" loading={busy} onClick={() => void signOutEverywhere()}>
              Sign out everywhere
            </Button>
          </div>
        </>
      )}
    </SpotlightCard>
  );
}

export default function DashboardPage() {
  const { user } = useAuth();
  if (!user) return null;
  const hello = greeting();
  const verse = verseOfTheDay();
  const firstName = user.displayName.split(' ')[0] ?? user.displayName;
  const steps = [
    { label: 'Create your account', done: true },
    { label: 'Confirm your email', done: user.emailVerified },
    { label: 'Protect it with two-step sign-in', done: user.twoFactorEnabled },
    { label: 'Explore the conditions library', done: false, soon: true },
  ];

  return (
    <div className="dashboard container">
      <header className="dash-hero">
        <Mandala size={300} className="dash-hero__mandala" />
        <p className="eyebrow">
          <span className="deva">{hello.deva}</span> · {hello.english}
        </p>
        <h1>
          <BlurReveal text={`Welcome, ${firstName}`} />
        </h1>
        <p className="muted">This is your space on Healthmarg. More arrives here as the library grows.</p>
      </header>

      <div className="dash-grid">
        <SpotlightCard className="dash-card dash-card--verse">
          <span className="eyebrow">Today’s sutra</span>
          <p className="deva dash-verse__sanskrit">{verse.sanskrit}</p>
          <p className="dash-verse__translit">{verse.transliteration}</p>
          <p className="dash-verse__meaning">{verse.meaning}</p>
          <small className="muted">{verse.source}</small>
        </SpotlightCard>

        <SpotlightCard className="dash-card">
          <h2 className="dash-card__title">Your path</h2>
          <ol className="path-steps">
            {steps.map((s) => (
              <li key={s.label} className={s.done ? 'path-steps__item path-steps__item--done' : 'path-steps__item'}>
                <span className="path-steps__dot" aria-hidden="true" />
                <span>
                  {s.label}
                  {s.soon && <span className="badge">Coming soon</span>}
                </span>
                <span className="visually-hidden">{s.done ? '(done)' : '(to do)'}</span>
              </li>
            ))}
          </ol>
        </SpotlightCard>

        <ProfileCard user={user} />
        <SecurityCard user={user} />

        <SpotlightCard className="dash-card dash-card--soon">
          <h2 className="dash-card__title">Coming soon</h2>
          <p className="muted">
            Articles on the causes of common conditions and their Ayurvedic remedies, to read or listen to, with your place
            saved. Bookmarks and “continue reading” will appear here.
          </p>
        </SpotlightCard>
      </div>
    </div>
  );
}
