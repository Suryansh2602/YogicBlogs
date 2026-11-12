// The About page, the footer's contact and registration details, and Home's "why" section.
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { WHATSAPP_GREETING } from '../../src/config/business';
import { mockApi } from '../helpers/api';
import { renderApp } from '../helpers/render';

const WHATSAPP = `https://wa.me/918982579178?text=${encodeURIComponent(WHATSAPP_GREETING)}`;

const quietApi = () => mockApi({ 'GET /articles': { body: { items: [], nextCursor: null } }, 'GET /conditions': { body: { items: [] } } });

describe('About page', () => {
  it('tells who we are, where the guidance comes from and how to reach us', async () => {
    quietApi();
    renderApp('/about');
    expect(await screen.findByRole('heading', { level: 1, name: 'A path back to the wisdom of the classical texts' })).toBeInTheDocument();
    const main = screen.getByRole('main');
    for (const name of ['Where our guidance comes from', 'What we do', 'Why connect with Healthmarg', 'Who we are', 'Talk to us']) {
      expect(within(main).getByRole('heading', { level: 2, name })).toBeInTheDocument();
    }
    // The corrected sources: Bhavaprakasha (not only its Nighantu); Gheranda's own seven-limbed path.
    expect(screen.getByText('Madhava Nidana, Sharangadhara Samhita and Bhavaprakasha')).toBeInTheDocument();
    expect(screen.getByText(/seven-limbed path of hatha yoga/)).toBeInTheDocument();
    expect(within(main).getByText('23AEYPU5249R1Z7')).toBeInTheDocument();
    expect(within(main).getByText('Registration applied for (application ref. 30261108128062156)')).toBeInTheDocument();
    expect(within(main).getByRole('link', { name: /Chat on WhatsApp/ })).toHaveAttribute('href', WHATSAPP);
    expect(within(main).getByRole('link', { name: /Call \+91 89825 79178/ })).toHaveAttribute('href', 'tel:+918982579178');
    expect(within(main).getByRole('note')).toHaveTextContent('not medical advice');
    await waitFor(() => {
      expect(document.title).toBe('About Healthmarg: our sources and what we do · Healthmarg');
    });
  });

  it('makes no cure or "100%" claims, in either language', async () => {
    quietApi();
    renderApp('/about');
    const main = await screen.findByRole('main');
    await screen.findByRole('heading', { level: 1 });
    const english = main.textContent;
    await userEvent.click(screen.getByRole('button', { name: 'हिन्दी' }));
    await screen.findByRole('heading', { level: 1, name: 'शास्त्रों के ज्ञान की ओर लौटने का मार्ग' });
    for (const text of [english, main.textContent]) {
      // "शुद्ध" (pure) as a claim; "शुद्धि" (cleansing, Gheranda's practice) is fine.
      expect(text).not.toMatch(/100\s?%|chemical-free|cure|reverse|रोग-मुक्त|रोगमुक्त|शुद्ध(?!ि)/i);
    }
  });

  it('switches to Hindi and back, with the page language and address following', async () => {
    quietApi();
    const router = renderApp('/about');
    await screen.findByRole('heading', { level: 1 });
    await userEvent.click(screen.getByRole('button', { name: 'हिन्दी' }));
    expect(await screen.findByRole('heading', { level: 2, name: 'हमारे ज्ञान के स्रोत' })).toBeInTheDocument();
    expect(router.state.location.search).toBe('?lang=hi');
    expect(screen.getByRole('link', { name: /WhatsApp पर बात करें/ })).toHaveAttribute('href', WHATSAPP);
    expect(screen.getByRole('link', { name: 'छह ऋतुएँ देखें' })).toHaveAttribute('href', '/ritucharya?lang=hi');
    await waitFor(() => {
      expect(document.documentElement.lang).toBe('hi');
    });
    await userEvent.click(screen.getByRole('button', { name: 'English' }));
    expect(await screen.findByRole('heading', { level: 2, name: 'Where our guidance comes from' })).toBeInTheDocument();
    expect(router.state.location.search).toBe('');
  });

  it('opens straight in Hindi from /about?lang=hi', async () => {
    quietApi();
    renderApp('/about?lang=hi');
    expect(await screen.findByRole('heading', { level: 1, name: 'शास्त्रों के ज्ञान की ओर लौटने का मार्ग' })).toBeInTheDocument();
  });
});

describe('site frame', () => {
  it('links to About from the header, and the footer carries contact and registration details', async () => {
    quietApi();
    renderApp('/');
    const nav = await screen.findByRole('navigation', { name: 'Main' });
    expect(within(nav).getByRole('link', { name: 'About' })).toHaveAttribute('href', '/about');
    const footer = screen.getByRole('contentinfo');
    expect(within(footer).getByRole('heading', { name: 'Talk to us' })).toBeInTheDocument();
    expect(within(footer).getByRole('link', { name: /Chat on WhatsApp/ })).toHaveAttribute('href', WHATSAPP);
    expect(within(footer).getByRole('link', { name: /Chat on WhatsApp/ })).toHaveAttribute('rel', 'noopener noreferrer');
    expect(within(footer).getByRole('link', { name: /Call \+91 89825 79178/ })).toHaveAttribute('href', 'tel:+918982579178');
    expect(within(footer).getByRole('link', { name: /About Healthmarg/ })).toHaveAttribute('href', '/about');
    expect(footer).toHaveTextContent(
      'HealthMarg · Proprietor Yogesh Upadhyay · Ambah, Morena, Madhya Pradesh · GSTIN 23AEYPU5249R1Z7 · FSSAI registration applied for (ref. 30261108128062156)',
    );
  });

  it('shows on Home why people choose Healthmarg, with a link to our story and a way to talk to us', async () => {
    quietApi();
    renderApp('/');
    const section = await screen.findByRole('region', { name: 'Why people choose Healthmarg' });
    expect(within(section).getAllByRole('listitem')).toHaveLength(4);
    expect(within(section).getByRole('link', { name: 'Our story →' })).toHaveAttribute('href', '/about');
    expect(within(section).getByRole('link', { name: /Chat on WhatsApp/ })).toHaveAttribute('href', WHATSAPP);
  });
});
