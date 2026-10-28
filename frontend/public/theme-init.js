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
})();
