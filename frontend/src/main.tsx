import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { createBrowserRouter, RouterProvider } from 'react-router';
import '@fontsource-variable/fraunces';
import '@fontsource-variable/dm-sans';
import '@fontsource/tiro-devanagari-hindi/devanagari-400.css';
import { routes } from './routes/routes';
import { ThemeProvider } from './theme/ThemeProvider';
import { AuthProvider } from './features/auth/AuthProvider';
import './styles/global.css';

const router = createBrowserRouter(routes);

const container = document.getElementById('root');
if (!container) throw new Error('index.html is missing the #root element');

createRoot(container).render(
  <StrictMode>
    <ThemeProvider>
      <AuthProvider>
        <RouterProvider router={router} />
      </AuthProvider>
    </ThemeProvider>
  </StrictMode>,
);
