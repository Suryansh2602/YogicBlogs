import { BUSINESS, callUrl, whatsappUrl } from '../config/business';
import './contactLinks.css';

function ChatIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false" className="contact-links__icon">
      <path
        d="M12 3.5c-4.7 0-8.5 3.4-8.5 7.6 0 2.3 1.1 4.3 2.9 5.7L5.6 20.5l4.1-2.1c.7.2 1.5.3 2.3.3 4.7 0 8.5-3.4 8.5-7.6S16.7 3.5 12 3.5Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function PhoneIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false" className="contact-links__icon">
      <path
        d="M6.6 3.8 9 3.5l1.6 4-2 1.4a11 11 0 0 0 5.5 5.5l1.4-2 4 1.6-.3 2.4a2 2 0 0 1-2 1.7C10.5 18.1 5.9 13.5 4.9 6.8a2 2 0 0 1 1.7-3Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** Talk to Healthmarg: a WhatsApp button (opens WhatsApp with a greeting typed in) and a call link showing the number. */
export function ContactLinks({ className = '', whatsappLabel = 'Chat on WhatsApp', callLabel = 'Call' }: { className?: string; whatsappLabel?: string; callLabel?: string }) {
  return (
    <div className={`contact-links ${className}`}>
      <a className="btn btn--primary btn--md contact-links__whatsapp" href={whatsappUrl()} target="_blank" rel="noopener noreferrer">
        <ChatIcon />
        <span className="btn__label">{whatsappLabel}</span>
      </a>
      <a className="contact-links__call" href={callUrl()}>
        <PhoneIcon />
        <span>
          {callLabel} <span className="contact-links__number">{BUSINESS.phone.display}</span>
        </span>
      </a>
    </div>
  );
}
