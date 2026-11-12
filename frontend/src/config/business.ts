// Who runs Healthmarg, and how to reach them: every detail in one place (docs/about-page.md). The registration
// details must match the certificates exactly.

export const BUSINESS = {
  /** The name on the GST registration. The site's brand is "Healthmarg". */
  tradeName: 'HealthMarg',
  proprietor: 'Yogesh Upadhyay',
  place: 'Ambah, Morena, Madhya Pradesh',
  gstin: '23AEYPU5249R1Z7',
  fssai: {
    /** The 14-digit registration number, once FSSAI issues the certificate. Until then the application is shown. */
    number: null as string | null,
    applicationRef: '30261108128062156',
  },
  phone: {
    /** For tel: and WhatsApp links: country code, then the number. */
    international: '918982579178',
    display: '+91 89825 79178',
  },
} as const;

/** Opens WhatsApp with a short greeting typed in; nothing is sent until the visitor presses send. */
export const WHATSAPP_GREETING = 'Namaste! I found Healthmarg and would like to know more.';

export const whatsappUrl = (text: string = WHATSAPP_GREETING) => `https://wa.me/${BUSINESS.phone.international}?text=${encodeURIComponent(text)}`;

export const callUrl = () => `tel:+${BUSINESS.phone.international}`;

/** "FSSAI Reg. No. …" once registered; until then, an honest "applied for". */
export const fssaiText = () =>
  BUSINESS.fssai.number ? `FSSAI Reg. No. ${BUSINESS.fssai.number}` : `FSSAI registration applied for (ref. ${BUSINESS.fssai.applicationRef})`;
