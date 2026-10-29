import { useSyncExternalStore } from 'react';
import './errorView.css';

const subscribe = (onChange: () => void) => {
  window.addEventListener('online', onChange);
  window.addEventListener('offline', onChange);
  return () => {
    window.removeEventListener('online', onChange);
    window.removeEventListener('offline', onChange);
  };
};

/** A slim notice under the header while the browser has no connection; gone as soon as it's back. */
export function OfflineNotice() {
  const online = useSyncExternalStore(
    subscribe,
    () => navigator.onLine,
    () => true,
  );
  if (online) return null;
  return (
    <p className="offline-notice" role="status">
      <span className="container">
        <strong>You’re offline.</strong> Pages you already opened still work; new ones will load when you’re back online.
      </span>
    </p>
  );
}
