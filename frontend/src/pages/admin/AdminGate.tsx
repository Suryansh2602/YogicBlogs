import { lazy, Suspense } from 'react';
import { NavLink, Outlet } from 'react-router';
import { PageLoader } from '../../components/ui/PageLoader';
import { LogoMark } from '../../components/brand/Logo';
import { useAuth } from '../../features/auth/useAuth';
import './admin.css';

const AdminSignIn = lazy(() => import('./AdminSignIn'));

const NAV = [
  { to: '/admin', label: 'Overview', deva: 'अवलोकन', end: true },
  { to: '/admin/conditions', label: 'Conditions', deva: 'रोग', end: false },
  { to: '/admin/users', label: 'Members', deva: 'सदस्य', end: false },
  { to: '/admin/audit', label: 'Audit log', deva: 'लेखा', end: false },
];

/**
 * Everything under /admin. Not an admin → the admin sign-in page; admin → the panel.
 * (The API checks role + 2FA on every request; this only decides what to show.)
 */
export default function AdminGate() {
  const { status, user } = useAuth();
  if (status === 'loading') return <PageLoader />;
  if (user?.role !== 'admin') {
    return (
      <Suspense fallback={<PageLoader />}>
        <AdminSignIn />
      </Suspense>
    );
  }
  return (
    <div className="admin container">
      <aside className="admin__side">
        <div className="admin__brand">
          <LogoMark size={34} />
          <span>
            Admin
            <small className="deva">प्रबन्धन</small>
          </span>
        </div>
        <nav aria-label="Admin" className="admin__nav">
          {NAV.map((item) => (
            <NavLink key={item.to} to={item.to} end={item.end} className="admin__link">
              <span>{item.label}</span>
              <span className="deva admin__link-deva" aria-hidden="true">
                {item.deva}
              </span>
            </NavLink>
          ))}
          <span className="admin__link admin__link--soon" aria-disabled="true">
            <span>Articles</span>
            <span className="badge">Soon</span>
          </span>
        </nav>
      </aside>
      <section className="admin__main">
        <Suspense fallback={<PageLoader />}>
          <Outlet />
        </Suspense>
      </section>
    </div>
  );
}
