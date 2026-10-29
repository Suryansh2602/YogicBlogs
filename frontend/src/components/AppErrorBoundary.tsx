// The outermost safety net: if something fails outside the router (the theme or sign-in providers, or
// the router itself), readers still get a calm page with a way home instead of a blank screen. The
// error is reported to the API. Plain links only: the router may be what failed.
import { Component, type ErrorInfo, type ReactNode } from 'react';
import { Logo } from './brand/Logo';
import { reportError } from '../services/errorReporting';
import './errorView.css';

interface State {
  failed: boolean;
}

export class AppErrorBoundary extends Component<{ children: ReactNode }, State> {
  override state: State = { failed: false };

  static getDerivedStateFromError(): State {
    return { failed: true };
  }

  override componentDidCatch(error: unknown, info: ErrorInfo) {
    reportError('crash', error);
    if (import.meta.env.DEV) console.error(error, info.componentStack);
  }

  override render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div className="error-shell">
        <header className="error-shell__header">
          <div className="container">
            <a href="/" aria-label="Healthmarg home">
              <Logo size={34} />
            </a>
          </div>
        </header>
        <main id="main">
          <section className="error-view" aria-labelledby="error-title">
            <h1 id="error-title">Something went wrong</h1>
            <div className="error-view__text">
              <p>Healthmarg couldn’t start properly in this browser. It isn’t anything you did.</p>
              <p>Reloading usually fixes it. If it keeps happening, please come back a little later.</p>
            </div>
            <div className="error-view__actions">
              <button
                type="button"
                className="btn btn--primary btn--md"
                onClick={() => {
                  window.location.reload();
                }}
              >
                <span className="btn__label">Reload</span>
              </button>
              <a href="/" className="btn btn--secondary btn--md">
                <span className="btn__label">Go home</span>
              </a>
            </div>
          </section>
        </main>
      </div>
    );
  }
}
