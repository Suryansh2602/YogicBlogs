import { Suspense, useEffect, useRef, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router';
import { Logo } from '../brand/Logo';
import { ThemeSwitcher } from '../ui/ThemeSwitcher';
import { PageLoader } from '../ui/PageLoader';
import { useAuth } from '../../features/auth/useAuth';
import { SeasonStrip } from '../../features/ritu/SeasonStrip';
import './layout.css';

const PAGES = [
  { to: '/', label: 'Home', end: true },
  { to: '/articles', label: 'Articles', end: false },
  { to: '/ritucharya', label: 'Ritucharya', end: false },
];

function PageLinks({ className }: { className: string }) {
  return PAGES.map((p) => (
    <NavLink key={p.to} to={p.to} end={p.end} className={className}>
      {p.label}
    </NavLink>
  ));
}

function AccountLinks({ className = 'header__link' }: { className?: string }) {
  const { status, user, signOut } = useAuth();
  const navigate = useNavigate();
  if (status === 'loading') return <span className="header__placeholder" aria-hidden="true" />;
  if (!user) {
    return (
      <>
        <NavLink to="/signin" className={className}>
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
      <NavLink to={user.role === 'admin' ? '/admin' : '/dashboard'} className={className}>
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

/** Phone and tablet menu: a button that opens every link, the theme and the account in a panel. */
function MobileMenu() {
  const [open, setOpen] = useState(false);
  const { pathname } = useLocation();
  const [shownFor, setShownFor] = useState(pathname);
  const rootRef = useRef<HTMLDivElement>(null);

  // Close after moving to another page (adjusted while rendering, not in an effect).
  if (pathname !== shownFor) {
    setShownFor(pathname);
    setOpen(false);
  }

  useEffect(() => {
    if (!open) return undefined;
    const close = (event: MouseEvent | KeyboardEvent) => {
      if (event instanceof KeyboardEvent ? event.key === 'Escape' : !rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', close);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', close);
    };
  }, [open]);

  return (
    <div className="menu" ref={rootRef}>
      <button
        type="button"
        className="menu__toggle"
        aria-expanded={open}
        aria-controls="site-menu"
        onClick={() => {
          setOpen((o) => !o);
        }}
      >
        <span className={`menu__icon ${open ? 'menu__icon--open' : ''}`} aria-hidden="true">
          <span />
          <span />
          <span />
        </span>
        Menu
      </button>
      {open && (
        <div
          id="site-menu"
          className="menu__panel"
          onClick={(event) => {
            // Close as soon as a link or button is chosen, not only once the next page has loaded.
            if ((event.target as HTMLElement).closest('a, button:not(.theme-switcher__toggle)')) setOpen(false);
          }}
        >
          <nav aria-label="Main" className="menu__links">
            <PageLinks className="menu__link" />
          </nav>
          <div className="menu__account">
            <AccountLinks className="menu__link" />
          </div>
          <div className="menu__theme">
            <span className="muted">Theme</span>
            <ThemeSwitcher />
          </div>
        </div>
      )}
    </div>
  );
}

/** Public site shell: header with the main links, the season strip, the page, and a footer with site links. */
export default function Layout() {
  const { user } = useAuth();
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
            <PageLinks className="header__link" />
          </nav>
          <div className="header__end">
            <ThemeSwitcher />
            <AccountLinks />
          </div>
          <MobileMenu />
        </div>
      </header>
      <SeasonStrip />

      {/* The footer waits for the page: shown before a lazily loaded page arrives, it would jump down (layout shift). */}
      <Suspense
        fallback={
          <main id="main" className="layout__main">
            <PageLoader />
          </main>
        }
      >
        <main id="main" className="layout__main">
          <Outlet />
        </main>
        <footer className="footer">
          <div className="container footer__grid">
            <div className="footer__about">
              <Logo size={32} />
              <p className="muted">Ayurveda and yoga for everyday health, explained clearly and checked against classical texts and research.</p>
              <p className="deva footer__deva">स्वास्थ्य का मार्ग</p>
            </div>
            <nav aria-label="Explore" className="footer__col">
              <h2 className="footer__heading">Explore</h2>
              <Link to="/">Home</Link>
              <Link to="/articles">Articles</Link>
              <Link to="/ritucharya">Ritucharya: the six seasons</Link>
            </nav>
            <nav aria-label="Account" className="footer__col">
              <h2 className="footer__heading">Account</h2>
              {user ? (
                <Link to={user.role === 'admin' ? '/admin' : '/dashboard'}>{user.role === 'admin' ? 'Admin panel' : 'My path'}</Link>
              ) : (
                <>
                  <Link to="/signin">Sign in</Link>
                  <Link to="/signup">Join free</Link>
                </>
              )}
            </nav>
          </div>
          <div className="container footer__bottom">
            <small>© {new Date().getFullYear()} Healthmarg</small>
            <small>Guidance, not a substitute for medical care. Please see a qualified doctor for any health problem.</small>
          </div>
        </footer>
      </Suspense>
    </div>
  );
}
