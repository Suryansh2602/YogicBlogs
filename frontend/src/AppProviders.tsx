import type { ReactNode } from 'react';
import { AppErrorBoundary } from './components/AppErrorBoundary';
import { AuthProvider } from './features/auth/AuthProvider';
import { ThemeProvider } from './theme/ThemeProvider';

/** Everything around the router. Shared by the browser (main.tsx) and the prerender step, so both draw the same tree. */
export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <AppErrorBoundary>
      <ThemeProvider>
        <AuthProvider>{children}</AuthProvider>
      </ThemeProvider>
    </AppErrorBoundary>
  );
}
