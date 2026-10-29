// The right error page for any error: the router's error screen and pages whose main content failed to
// load both use this, so the same error always looks and reads the same.
import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { ErrorView } from './ErrorView';
import { errorKind, errorReference } from '../routes/errorKind';
import { ApiRequestError } from '../services/apiClient';
import NotFoundPage from '../pages/NotFoundPage';

const reloadPage = () => {
  window.location.reload();
};

function Reference({ value }: { value: string | undefined }) {
  if (!value) return null;
  return (
    <p className="error-view__ref">
      Reference: <code>{value}</code>. If you contact us, quoting it helps us find what went wrong.
    </p>
  );
}

const waitText = (seconds: number | undefined) => {
  if (!seconds) return 'a little while';
  if (seconds < 90) return `${String(seconds)} seconds`;
  const minutes = Math.ceil(seconds / 60);
  return `${String(minutes)} minute${minutes === 1 ? '' : 's'}`;
};

interface ErrorPageForProps {
  error: unknown;
  /** What "Try again" does; reloads the page when not given. */
  onRetry?: () => void;
  /** Headline for a general failure, e.g. "This article couldn’t load". */
  crashTitle?: string;
}

export function ErrorPageFor({ error, onRetry = reloadPage, crashTitle = 'Something went wrong' }: ErrorPageForProps) {
  const kind = errorKind(error, navigator.onLine);
  const reference = errorReference(error);
  const retry = (label = 'Try again'): ReactNode => (
    <button type="button" className="btn btn--primary btn--md" onClick={onRetry}>
      <span className="btn__label">{label}</span>
    </button>
  );
  const home = (
    <Link to="/" className="btn btn--secondary btn--md">
      <span className="btn__label">Go home</span>
    </Link>
  );

  switch (kind) {
    case 'notFound':
      return <NotFoundPage />;
    case 'offline':
      return (
        <ErrorView title="You’re offline" actions={retry()}>
          <p>This page needs an internet connection to load. Check your Wi-Fi or mobile data, then try again.</p>
        </ErrorView>
      );
    case 'updated':
      return (
        <ErrorView title="Healthmarg has been updated" actions={retry('Reload the page')}>
          <p>A newer version of the site came out while this tab was open. Reload once to carry on where you were.</p>
        </ErrorView>
      );
    case 'signedOut':
      return (
        <ErrorView
          code="401"
          title="Please sign in to continue"
          actions={
            <>
              <Link to="/signin" className="btn btn--primary btn--md">
                <span className="btn__label">Sign in</span>
              </Link>
              {home}
            </>
          }
        >
          <p>This page is for signed-in members. Your session may have ended; signing in again brings you back.</p>
        </ErrorView>
      );
    case 'forbidden':
      return (
        <ErrorView
          code="403"
          title="You don’t have access to this page"
          actions={
            <>
              {home}
              <Link to="/signin" className="btn btn--secondary btn--md">
                <span className="btn__label">Sign in with another account</span>
              </Link>
            </>
          }
        >
          <p>{error instanceof ApiRequestError && error.message ? error.message : 'Your account isn’t allowed to open it.'}</p>
        </ErrorView>
      );
    case 'rateLimited':
      return (
        <ErrorView code="429" title="Too many requests" actions={retry()}>
          <p>
            Healthmarg received a lot of requests from your connection in a short time. Please wait{' '}
            {waitText(error instanceof ApiRequestError ? error.retryAfter : undefined)} and try again.
          </p>
        </ErrorView>
      );
    case 'unavailable':
      return (
        <ErrorView code="503" title="Healthmarg is temporarily unavailable" actions={retry()} links>
          <p>We’re having trouble reaching our servers right now. This usually clears up within a minute or two.</p>
          <Reference value={reference} />
        </ErrorView>
      );
    case 'crash':
      return (
        <ErrorView
          title={crashTitle}
          links
          actions={
            <>
              {retry()}
              {home}
            </>
          }
        >
          <p>This page ran into a problem on our side. It isn’t anything you did.</p>
          <p>Trying again usually fixes it. If it keeps happening, please come back a little later.</p>
          <Reference value={reference} />
        </ErrorView>
      );
  }
}
