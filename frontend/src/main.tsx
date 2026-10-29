import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { createBrowserRouter, RouterProvider } from 'react-router';
import '@fontsource-variable/fraunces';
import '@fontsource-variable/dm-sans';
import '@fontsource/tiro-devanagari-hindi/devanagari-400.css';
import { routes } from './routes/routes';
import { ThemeProvider } from './theme/ThemeProvider';
import { AuthProvider } from './features/auth/AuthProvider';
import { AppErrorBoundary } from './components/AppErrorBoundary';
import { installGlobalErrorHandlers } from './services/errorReporting';
import './styles/global.css';

// The global error handler: errors nothing else caught are reported, never lost (services/errorReporting.ts).
installGlobalErrorHandlers();

const router = createBrowserRouter(routes);

const container = document.getElementById('root');
if (!container) throw new Error('index.html is missing the #root element');

createRoot(container).render(
  <StrictMode>
    <AppErrorBoundary>
      <ThemeProvider>
        <AuthProvider>
          <RouterProvider router={router} />
        </AuthProvider>
      </ThemeProvider>
    </AppErrorBoundary>
  </StrictMode>,
);
