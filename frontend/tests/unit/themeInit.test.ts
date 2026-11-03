// public/theme-init.js runs before first paint: it sets the theme, and hides a page built in advance for
// another address (a host answering /signin with Home's file), so the wrong page never shows.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { runInThisContext } from 'node:vm';
import { afterEach, describe, expect, it } from 'vitest';

const SCRIPT = readFileSync(resolve('public/theme-init.js'), 'utf8'); // tests run from frontend/

function runAt(address: string, prerendered?: string) {
  document.head.querySelectorAll('meta[name="hm-prerendered"]').forEach((m) => {
    m.remove();
  });
  document.documentElement.className = '';
  window.history.replaceState(null, '', address);
  if (prerendered !== undefined) {
    const meta = document.createElement('meta');
    meta.name = 'hm-prerendered';
    meta.content = prerendered;
    document.head.append(meta);
  }
  // The same as a classic <script src> in the head: runs with the page's globals (window, document).
  runInThisContext(SCRIPT);
  return document.documentElement;
}

afterEach(() => {
  document.head.querySelector('meta[name="hm-prerendered"]')?.remove();
  document.documentElement.className = '';
  document.documentElement.removeAttribute('data-theme');
});

describe('theme-init.js', () => {
  it('sets the saved theme, or the default', () => {
    expect(runAt('/').dataset['theme']).toBe('ushas');
    localStorage.setItem('hm-theme', 'vana');
    expect(runAt('/').dataset['theme']).toBe('vana');
  });

  it('keeps a prerendered page shown at its own address, with or without a trailing slash', () => {
    expect(runAt('/ritucharya?ritu=varsha', '/ritucharya')).not.toHaveClass('hm-shell');
    expect(runAt('/ritucharya/', '/ritucharya')).not.toHaveClass('hm-shell');
    expect(runAt('/', '/')).not.toHaveClass('hm-shell');
  });

  it('hides a prerendered page served for another address', () => {
    expect(runAt('/signin', '/')).toHaveClass('hm-shell');
  });

  it('leaves an ordinary page alone', () => {
    expect(runAt('/signin')).not.toHaveClass('hm-shell');
  });
});
