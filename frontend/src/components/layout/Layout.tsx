import { Suspense } from 'react';
import { Link, NavLink, Outlet, useNavigate } from 'react-router';
import { Logo } from '../brand/Logo';
import { ThemeSwitcher } from '../ui/ThemeSwitcher';
import { PageLoader } from '../ui/PageLoader';
import { useAuth } from '../../features/auth/useAuth';
import './layout.css';

function AccountLinks() {
  const { status, user, signOut } = useAuth();
  const navigate = useNavigate();
  if (status === 'loading') return <span className="header__placeholder" aria-hidden="true" />;
  if (!user) {
    return (
      <>
        <NavLink to="/signin" className="header__link">
          Sign in
        </NavLink>
        <Link to="/signup" className="btn btn--primary btn--sm">
          <span className="btn__label">Join free</span>
        </Link>
      </>
    );
  }
  return (
    <>
      <NavLink to={user.role === 'admin' ? '/admin' : '/dashboard'} className="header__link">
        {user.role === 'admin' ? 'Admin panel' : 'My path'}
      </NavLink>
      <button
        type="button"
        className="btn btn--ghost btn--sm"
        onClick={() => {
          // Leave the protected page first, so its guard doesn't redirect to sign-in mid sign-out.
          void navigate('/', { replace: true });
          void signOut();
        }}
      >
        <span className="btn__label">Sign out</span>
      </button>
    </>
  );
}

/** Public site shell: header with logo, theme switcher and account links; footer with tagline. */
export default function Layout() {
  return (
    <div className="layout">
      <a href="#main" className="skip-link">
        Skip to content
      </a>
      <header className="header">
        <div className="container header__inner">
          <Link to="/" className="header__brand" aria-label="Healthmarg home">
            <Logo size={38} />
          </Link>
          <nav aria-label="Main" className="header__nav">
            <NavLink to="/" end className="header__link header__link--hide-sm">
              Home
            </NavLink>
            <NavLink to="/ritucharya" className="header__link header__link--hide-sm">
              Ritucharya
            </NavLink>
            <ThemeSwitcher />
            <AccountLinks />
          </nav>
        </div>
      </header>

      <main id="main" className="layout__main">
        <Suspense fallback={<PageLoader />}>
          <Outlet />
        </Suspense>
      </main>

      <footer className="footer">
        <div className="container footer__inner">
          <span className="footer__tagline">Break limits. Find ease.</span>
          <span className="deva footer__deva">स्वास्थ्य का मार्ग</span>
          <small className="muted">© {new Date().getFullYear()} Healthmarg. Guidance, not a substitute for medical care.</small>
        </div>
      </footer>
    </div>
  );
}
