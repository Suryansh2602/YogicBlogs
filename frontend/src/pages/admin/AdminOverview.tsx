import { SpotlightCard } from '../../components/motion/SpotlightCard';
import { Alert } from '../../components/ui/Alert';
import { Spinner } from '../../components/ui/Spinner';
import { adminApi, type AdminStats } from '../../features/auth/api';
import { useAuth } from '../../features/auth/useAuth';
import { useAdminData } from './useAdminData';

const CARDS: { key: keyof AdminStats; label: string; note: string }[] = [
  { key: 'users', label: 'Members', note: 'All accounts' },
  { key: 'verified', label: 'Verified', note: 'Confirmed their email' },
  { key: 'newThisWeek', label: 'New this week', note: 'Joined in the last 7 days' },
  { key: 'activeThisWeek', label: 'Active this week', note: 'Signed in in the last 7 days' },
  { key: 'admins', label: 'Admins', note: 'With panel access' },
  { key: 'suspended', label: 'Suspended', note: 'Blocked from signing in' },
];

export default function AdminOverview() {
  const { user } = useAuth();
  const stats = useAdminData(() => adminApi.stats(), []);
  return (
    <>
      <header className="admin__header">
        <p className="eyebrow">
          <span className="deva">स्वागतम्</span> · Welcome back
        </p>
        <h1>{user?.displayName}</h1>
      </header>
      {stats.status === 'loading' && <Spinner size={28} label="Loading numbers" />}
      {stats.status === 'error' && <Alert tone="danger">{stats.message}</Alert>}
      {stats.status === 'ready' && (
        <div className="stat-grid">
          {CARDS.map((card, i) => (
            <SpotlightCard key={card.key} className="stat rise-in">
              <span className="stat__label">{card.label}</span>
              <span className="stat__value" style={{ animationDelay: `${i * 60}ms` }}>
                {stats.data[card.key].toLocaleString()}
              </span>
              <span className="stat__note muted">{card.note}</span>
            </SpotlightCard>
          ))}
        </div>
      )}
      <Alert tone="info" title="Next in the panel">
        Writing and designing articles, the conditions library and photo uploads arrive in the content phase.
      </Alert>
    </>
  );
}
