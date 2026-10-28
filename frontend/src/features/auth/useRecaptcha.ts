import { useCallback } from 'react';

// Google reCAPTCHA v3 (invisible, score-based). Only active when VITE_RECAPTCHA_SITE_KEY is set (the
// site key is public by design; the secret stays on the server). Locally it's unset and the server runs
// with RECAPTCHA_MODE=off, so forms work without Google.
const SITE_KEY = import.meta.env.VITE_RECAPTCHA_SITE_KEY;

interface Grecaptcha {
  ready: (cb: () => void) => void;
  execute: (siteKey: string, options: { action: string }) => Promise<string>;
}

declare global {
  interface Window {
    grecaptcha?: Grecaptcha;
  }
}

let loading: Promise<Grecaptcha> | null = null;

/** Load Google's script once, on first use (not on page load), so it never slows the first paint. */
function loadScript(siteKey: string): Promise<Grecaptcha> {
  loading ??= new Promise<Grecaptcha>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = `https://www.google.com/recaptcha/api.js?render=${encodeURIComponent(siteKey)}`;
    script.async = true;
    script.onload = () => {
      const g = window.grecaptcha;
      if (g) g.ready(() => { resolve(g); });
      else reject(new Error('reCAPTCHA failed to load'));
    };
    script.onerror = () => {
      loading = null;
      reject(new Error('reCAPTCHA failed to load'));
    };
    document.head.appendChild(script);
  });
  return loading;
}

/** Returns `getToken(action)`: a fresh token for that action, or undefined when reCAPTCHA is off. */
export function useRecaptcha() {
  return useCallback(async (action: string): Promise<string | undefined> => {
    if (!SITE_KEY) return undefined;
    const grecaptcha = await loadScript(SITE_KEY);
    return grecaptcha.execute(SITE_KEY, { action });
  }, []);
}
