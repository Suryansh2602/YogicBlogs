// The router's error screen: shown when a page throws, its code can't load, or the address doesn't
// exist. Inside the site frame (header, season strip, footer) for page errors; `standalone` when the
// frame itself failed, with a minimal header so readers can still get home.
import { useEffect } from 'react';
import { Link, useRouteError } from 'react-router';
import { Logo } from '../components/brand/Logo';
import { ErrorView } from '../components/ErrorView';
import { errorKind } from '../routes/errorKind';
import NotFoundPage from './NotFoundPage';
import '../components/errorView.css';

const reload = () => {
  window.location.reload();
};

function ErrorContent() {
  const error = useRouteError();
  const kind = errorKind(error, navigator.onLine);

  useEffect(() => {
    document.title = 'Something went wrong · Healthmarg';
    // For developers only: readers never see technical details.
    if (import.meta.env.DEV) console.error(error);
  }, [error]);

  if (kind === 'notFound') return <NotFoundPage />;
  if (kind === 'offline') {
    return (
      <ErrorView
        title="You’re offline"
        actions={
          <button type="button" className="btn btn--primary btn--md" onClick={reload}>
            <span className="btn__label">Try again</span>
          </button>
        }
      >
        <p>This page needs an internet connection to load. Check your Wi-Fi or mobile data, then try again.</p>
      </ErrorView>
    );
  }
  if (kind === 'updated') {
    return (
      <ErrorView
        title="Healthmarg has been updated"
        actions={
          <button type="button" className="btn btn--primary btn--md" onClick={reload}>
            <span className="btn__label">Reload the page</span>
          </button>
        }
      >
        <p>A newer version of the site came out while this tab was open. Reload once to carry on where you were.</p>
      </ErrorView>
    );
  }
  return (
    <ErrorView
      title="Something went wrong"
      links
      actions={
        <>
          <button type="button" className="btn btn--primary btn--md" onClick={reload}>
            <span className="btn__label">Try again</span>
          </button>
          <Link to="/" className="btn btn--secondary btn--md">
            <span className="btn__label">Go home</span>
          </Link>
        </>
      }
    >
      <p>This page ran into a problem on our side. It isn’t anything you did.</p>
      <p>Trying again usually fixes it. If it keeps happening, please come back a little later.</p>
    </ErrorView>
  );
}

export default function RouteError({ standalone = false }: { standalone?: boolean }) {
  if (!standalone) return <ErrorContent />;
  return (
    <div className="error-shell">
      <header className="error-shell__header">
        <div className="container">
          <Link to="/" aria-label="Healthmarg home">
            <Logo size={34} />
          </Link>
        </div>
      </header>
      <main id="main">
        <ErrorContent />
      </main>
    </div>
  );
}
