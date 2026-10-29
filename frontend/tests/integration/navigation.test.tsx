// Site navigation: the header links, the phone/tablet Menu, the footer, and the home page's latest articles.
import { beforeAll, describe, expect, it } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { mockApi } from '../helpers/api';
import { byId, preloadPages, renderApp } from '../helpers/render';

beforeAll(preloadPages, 60_000);

const noArticles = { 'GET /articles': { body: { items: [], nextCursor: null } } };
const article = (slug: string, title: string) => ({
  slug,
  title,
  summary: `${title}: a short summary.`,
  accent: 'teal',
  condition: { slug: 'stress', name: 'Stress & anxiety' },
  readingMinutes: 4,
  accessLevel: 'public',
  publishedAt: '2026-10-28T06:00:00Z',
  cover: null,
});

describe('header', () => {
  it('links to Home, Articles and Ritucharya, marking the current page', () => {
    mockApi(noArticles);
    renderApp('/');
    const nav = screen.getByRole('navigation', { name: 'Main' });
    expect(within(nav).getByRole('link', { name: 'Home' })).toHaveAttribute('aria-current', 'page');
    expect(within(nav).getByRole('link', { name: 'Articles' })).toHaveAttribute('href', '/articles');
    expect(within(nav).getByRole('link', { name: 'Ritucharya' })).toHaveAttribute('href', '/ritucharya');
  });
});

describe('phone and tablet menu', () => {
  it('opens with every link and the account actions, and closes with Escape', async () => {
    mockApi(noArticles);
    renderApp('/');
    const toggle = screen.getByRole('button', { name: 'Menu' });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await userEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    const panel = byId('site-menu');
    expect(within(panel).getByRole('link', { name: 'Articles' })).toBeInTheDocument();
    expect(within(panel).getByRole('link', { name: 'Ritucharya' })).toBeInTheDocument();
    expect(await within(panel).findByRole('link', { name: 'Sign in' })).toBeInTheDocument();
    expect(within(panel).getByRole('link', { name: 'Join free' })).toBeInTheDocument();
    await userEvent.keyboard('{Escape}');
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(document.getElementById('site-menu')).toBeNull();
  });

  it('closes after choosing a page', async () => {
    mockApi({ ...noArticles, 'GET /conditions': { body: { items: [] } } });
    const router = renderApp('/');
    await userEvent.click(screen.getByRole('button', { name: 'Menu' }));
    await userEvent.click(within(byId('site-menu')).getByRole('link', { name: 'Ritucharya' }));
    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/ritucharya');
    });
    expect(document.getElementById('site-menu')).toBeNull();
  });
});

describe('footer', () => {
  it('has Explore and Account links and the medical note', async () => {
    mockApi(noArticles);
    renderApp('/');
    const footer = screen.getByRole('contentinfo');
    const explore = within(footer).getByRole('navigation', { name: 'Explore' });
    expect(within(explore).getByRole('link', { name: 'Articles' })).toHaveAttribute('href', '/articles');
    expect(within(explore).getByRole('link', { name: /Ritucharya/ })).toHaveAttribute('href', '/ritucharya');
    expect(await within(within(footer).getByRole('navigation', { name: 'Account' })).findByRole('link', { name: 'Join free' })).toHaveAttribute('href', '/signup');
    expect(within(footer).getByText(/not a substitute for medical care/)).toBeInTheDocument();
  });
});

describe('home: latest articles', () => {
  it('shows the newest article as the lead and the next ones as a list', async () => {
    mockApi({ 'GET /articles': { body: { items: [article('one', 'Sleep well'), article('two', 'Calm digestion'), article('three', 'Easy breath')], nextCursor: null } } });
    renderApp('/');
    const section = await screen.findByRole('region', { name: 'Latest articles' });
    const links = within(section).getAllByRole('link').map((a) => a.getAttribute('href'));
    expect(links).toEqual(['/articles', '/articles/one', '/articles/two', '/articles/three']);
    expect(within(section).getAllByText('Stress & anxiety')).toHaveLength(3); // the condition label on each
    expect(within(section).getAllByText('4 min read')).toHaveLength(3);
  });

  it('is left out when there are no articles yet, or the list can’t load', async () => {
    mockApi({ 'GET /articles': { status: 503, body: { error: { message: 'down' } } } });
    renderApp('/');
    await screen.findByRole('heading', { name: 'What you’ll find here' });
    await waitFor(() => {
      expect(screen.queryByRole('region', { name: 'Latest articles' })).toBeNull();
    });
  });
});
