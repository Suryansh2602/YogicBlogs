import { useState } from 'react';

/**
 * Read `?token=` from an emailed link once, then remove it from the address bar and history, so it
 * can't leak through the Referer header, screenshots, or someone pressing Back later.
 */
export function useUrlToken() {
  const [token] = useState(() => {
    const url = new URL(window.location.href);
    const value = url.searchParams.get('token');
    if (value) {
      url.searchParams.delete('token');
      window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}${url.hash}`);
    }
    return value && /^[A-Za-z0-9_-]{20,200}$/.test(value) ? value : null;
  });
  return token;
}
