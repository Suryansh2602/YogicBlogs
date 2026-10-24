import { Link, NavLink, Outlet } from 'react-router';
import './Layout.css';

export default function Layout() {
  return (
    <div className="layout">
      <header className="layout__header">
        <Link to="/" className="layout__brand">
          <img src="/lotus.svg" alt="" width="32" height="32" />
          <span>Nerve and Nector</span>
        </Link>
        <nav aria-label="Main">
          <NavLink to="/" end>
            Home
          </NavLink>
        </nav>
      </header>

      <main className="layout__main">
        <Outlet />
      </main>

      <footer className="layout__footer">
        <small>© {new Date().getFullYear()} Nerve and Nector</small>
      </footer>
    </div>
  );
}
