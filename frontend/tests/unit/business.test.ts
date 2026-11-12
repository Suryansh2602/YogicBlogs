// The business details and contact links (src/config/business.ts): a typo here would send people to the
// wrong number or show a wrong registration.
import { describe, expect, it } from 'vitest';
import { BUSINESS, callUrl, fssaiText, WHATSAPP_GREETING, whatsappUrl } from '../../src/config/business';

/** GSTIN check character: the government's mod-36 rule over the first 14 characters. */
function gstinCheckChar(first14: string) {
  const chars = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  let sum = 0;
  for (let i = 0; i < first14.length; i++) {
    const product = chars.indexOf(first14.charAt(i)) * (i % 2 === 0 ? 1 : 2);
    sum += Math.floor(product / 36) + (product % 36);
  }
  return chars.charAt((36 - (sum % 36)) % 36);
}

describe('business details', () => {
  it('opens WhatsApp for +91 89825 79178 with the greeting typed in', () => {
    expect(whatsappUrl()).toBe(`https://wa.me/918982579178?text=${encodeURIComponent(WHATSAPP_GREETING)}`);
    // wa.me wants the number with its country code and nothing else: no "+", spaces or leading zero.
    expect(new URL(whatsappUrl()).pathname).toBe('/918982579178');
    expect(new URL(whatsappUrl('Hi & bye?')).searchParams.get('text')).toBe('Hi & bye?');
  });

  it('calls the same number', () => {
    expect(callUrl()).toBe('tel:+918982579178');
    expect(BUSINESS.phone.display.replace(/\D/g, '')).toBe(BUSINESS.phone.international);
  });

  it('has a well-formed GSTIN for Madhya Pradesh, with a correct check character', () => {
    expect(BUSINESS.gstin).toMatch(/^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/);
    expect(BUSINESS.gstin.slice(0, 2)).toBe('23'); // Madhya Pradesh
    expect(BUSINESS.gstin.at(-1)).toBe(gstinCheckChar(BUSINESS.gstin.slice(0, 14)));
  });

  it('says the FSSAI registration is applied for until its number is set', () => {
    expect(BUSINESS.fssai.number).toBeNull();
    expect(fssaiText()).toBe('FSSAI registration applied for (ref. 30261108128062156)');
  });
});
