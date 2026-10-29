// The router's error screen: shown when a page throws, its code can't load, an API error is passed up,
// or the address doesn't exist. Inside the site frame (header, season strip, footer) for page errors;
// `standalone` when the frame itself failed, with a minimal header so readers can still get home.
// Real faults are reported to the API by the global error handler.
import { useEffect } from 'react';
import { Link, useRouteError } from 'react-router';
import { Logo } from '../components/brand/Logo';
import { ErrorPageFor } from '../components/ErrorPages';
import { errorKind } from '../routes/errorKind';
import { reportError } from '../services/errorReporting';
import '../components/errorView.css';

function ErrorContent() {
  const error = useRouteError();

  useEffect(() => {
    document.title = 'Something went wrong · Healthmarg';
    const kind = errorKind(error, navigator.onLine);
    if (kind === 'crash' || kind === 'unavailable') reportError('crash', error);
    else if (kind === 'updated') reportError('updated', error);
    // For developers only: readers never see technical details.
    if (import.meta.env.DEV) console.error(error);
  }, [error]);

  return <ErrorPageFor error={error} />;
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
