import Layout from '../components/layout/Layout.jsx';
import HomePage from '../pages/HomePage.jsx';
import NotFoundPage from '../pages/NotFoundPage.jsx';

// Route objects are shared by the browser router (main.jsx) and the memory router in tests.
// Add protected and admin-only routes here as features are built.
export const routes = [
  {
    path: '/',
    element: <Layout />,
    children: [
      { index: true, element: <HomePage /> },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
];
