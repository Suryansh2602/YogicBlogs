import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { mockApi } from '../helpers/api';
import { preloadPages, renderApp } from '../helpers/render';

beforeAll(preloadPages, 60_000);
afterEach(() => {
  vi.useRealTimers();
});

/** jsdom has no geolocation: give the page a fake one for this test. */
const fakeGeolocation = (getCurrentPosition: Geolocation['getCurrentPosition']) => {
  Object.defineProperty(navigator, 'geolocation', { value: { getCurrentPosition }, configurable: true });
};

const atDate = (iso: string) => {
  vi.useFakeTimers({ toFake: ['Date'], now: new Date(iso) });
};

describe('home: Today panel', () => {
  it('shows the date, the current ritu and sunrise/sunset for New Delhi, with a link to that season', async () => {
    atDate('2026-10-28T06:00:00Z'); // 11:30 in India
    mockApi({});
    renderApp('/');
    const panel = await screen.findByRole('complementary', { name: /Today/ });
    expect(within(panel).getByText('Wednesday, 28 October 2026')).toBeInTheDocument();
    expect(within(panel).getByText(/^Sharad/)).toBeInTheDocument();
    expect(within(panel).getByText(/^6:\d\d\s?am$/i)).toBeInTheDocument();
    expect(within(panel).getByText(/^5:\d\d\s?pm$/i)).toBeInTheDocument();
    expect(within(panel).getByRole('link', { name: 'Living well in Sharad →' })).toHaveAttribute('href', '/ritucharya?ritu=sharad');
    // The first card is now Ritucharya.
    expect(screen.getByRole('link', { name: /Explore the six ritus/ })).toHaveAttribute('href', '/ritucharya');
  });

  it('notes Ritusandhi when the seasons are changing', async () => {
    atDate('2026-09-20T06:00:00Z');
    mockApi({});
    renderApp('/');
    expect(await screen.findByText(/Varsha is giving way to Sharad/)).toBeInTheDocument();
  });

  it('uses the visitor’s location only when asked, and explains a refusal', async () => {
    mockApi({});
    const getCurrentPosition = vi.fn((_ok: PositionCallback, fail?: PositionErrorCallback | null) => {
      fail?.({ code: 1, PERMISSION_DENIED: 1, POSITION_UNAVAILABLE: 2, TIMEOUT: 3, message: 'denied' });
    });
    fakeGeolocation(getCurrentPosition);
    renderApp('/');
    await screen.findByRole('complementary', { name: /Today/ });
    expect(getCurrentPosition).not.toHaveBeenCalled(); // never asked on page load
    await userEvent.click(screen.getByRole('button', { name: 'Use my location' }));
    expect(getCurrentPosition).toHaveBeenCalledTimes(1);
    expect(await screen.findByText(/Location wasn’t shared, so times are for New Delhi/)).toBeInTheDocument();
  });

  it('switches to the visitor’s location when they share it, and remembers it', async () => {
    mockApi({});
    const getCurrentPosition = vi.fn((ok: PositionCallback) => {
      ok({ coords: { latitude: 19.076, longitude: 72.8777 } } as GeolocationPosition);
    });
    fakeGeolocation(getCurrentPosition);
    renderApp('/');
    await userEvent.click(await screen.findByRole('button', { name: 'Use my location' }));
    expect(await screen.findByText(/For Your location/)).toBeInTheDocument();
    expect(JSON.parse(localStorage.getItem('hm-place') ?? '{}')).toMatchObject({ latitude: 19.08, longitude: 72.88 });
    await userEvent.click(screen.getByRole('button', { name: 'Use New Delhi' }));
    expect(localStorage.getItem('hm-place')).toBeNull();
  });
});

describe('Ritucharya page', () => {
  it('opens on the current season and shows its guidance, doshas and sources', async () => {
    atDate('2026-10-28T06:00:00Z');
    mockApi({});
    renderApp('/ritucharya');
    const tab = await screen.findByRole('tab', { name: /Sharad/ });
    expect(tab).toHaveAttribute('aria-selected', 'true');
    const panel = screen.getByRole('tabpanel');
    expect(within(panel).getByRole('heading', { level: 2, name: /Sharad/ })).toBeInTheDocument();
    expect(within(panel).getByText('Aggravated (prakopa)')).toBeInTheDocument(); // Pitta in Sharad
    expect(within(panel).getByRole('heading', { name: /What to eat/ })).toBeInTheDocument();
    expect(within(panel).getByText(/Kapalabhati and Bhastrika are not for people with uncontrolled high blood pressure/)).toBeInTheDocument();
    // Cited in the season's own list and in the full list; the full one links to PubMed.
    const cited = screen.getAllByRole('link', { name: /Chaddha A, et al/ }).map((a) => a.getAttribute('href'));
    expect(cited).toContain('https://pubmed.ncbi.nlm.nih.gov/31331557/');
    expect(screen.getByText(/For education only, not medical advice/)).toBeInTheDocument();
  });

  it('switches season by click and with the arrow keys, keeping the choice in the address', async () => {
    mockApi({});
    const router = renderApp('/ritucharya?ritu=grishma');
    expect(await screen.findByRole('tab', { name: /Grishma/ })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByText(/Sheetali \(cooling breath/)).toBeInTheDocument();

    await userEvent.click(screen.getByRole('tab', { name: /Varsha/ }));
    expect(screen.getByRole('tabpanel')).toHaveTextContent('Monsoon');
    expect(router.state.location.search).toBe('?ritu=varsha');

    await userEvent.keyboard('{ArrowRight}');
    expect(screen.getByRole('tab', { name: /Sharad/ })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: /Sharad/ })).toHaveFocus();
    await userEvent.keyboard('{End}');
    expect(screen.getByRole('tab', { name: /Hemanta/ })).toHaveAttribute('aria-selected', 'true');
    await userEvent.keyboard('{ArrowRight}');
    expect(screen.getByRole('tab', { name: /Shishira/ })).toHaveAttribute('aria-selected', 'true');
  });

  it('ignores a made-up season in the address and shows the current one', async () => {
    atDate('2026-05-20T06:00:00Z');
    mockApi({});
    renderApp('/ritucharya?ritu=<script>');
    expect(await screen.findByRole('tab', { name: /Grishma/ })).toHaveAttribute('aria-selected', 'true');
  });
});
