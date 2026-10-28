import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { createBrowserRouter, RouterProvider } from 'react-router';
import { routes } from './routes/routes';
import './styles/global.css';

const router = createBrowserRouter(routes);

const container = document.getElementById('root');
if (!container) throw new Error('index.html is missing the #root element');

createRoot(container).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
);
