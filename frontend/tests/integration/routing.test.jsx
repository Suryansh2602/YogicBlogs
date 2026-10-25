import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { routes } from '../../src/routes/routes.jsx';

function renderAt(path) {
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  render(<RouterProvider router={router} />);
  return router;
}

describe('app routing', () => {
  it('renders the home page inside the layout', () => {
    renderAt('/');
    expect(screen.getByRole('heading', { level: 1, name: 'Healthmarg' })).toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: 'Main' })).toBeInTheDocument();
  });

  it('shows the not-found page for unknown paths', () => {
    renderAt('/no-such-page');
    expect(screen.getByRole('heading', { name: 'Page not found' })).toBeInTheDocument();
  });

  it('navigates home from the not-found page', async () => {
    const router = renderAt('/no-such-page');
    await userEvent.click(screen.getByRole('link', { name: 'Go back home' }));
    expect(router.state.location.pathname).toBe('/');
    expect(screen.getByRole('heading', { level: 1, name: 'Healthmarg' })).toBeInTheDocument();
  });
});
