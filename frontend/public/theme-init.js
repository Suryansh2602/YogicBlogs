// Runs before first paint (blocking, in <head>) so the page never flashes the wrong theme.
// External file rather than inline, so a strict Content-Security-Policy can forbid inline scripts.
(function () {
  var themes = ['ushas', 'ratri', 'kesar', 'vana'];
  var theme;
  try {
    theme = localStorage.getItem('hm-theme');
  } catch {
    theme = null;
  }
  if (themes.indexOf(theme) === -1) {
    theme = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'ratri' : 'ushas';
  }
  document.documentElement.setAttribute('data-theme', theme);

  // A page built in advance for another address (a host answering /signin with Home's file): hide it, so the
  // wrong page never shows; the app then starts empty. Same path rule as src/prerender/paths.ts.
  var built = document.querySelector('meta[name="hm-prerendered"]');
  var here = location.pathname.replace(/\/+$/, '') || '/';
  if (built && built.getAttribute('content') !== here) document.documentElement.classList.add('hm-shell');
})();
