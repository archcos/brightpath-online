// Light/dark toggle in the header. A saved choice wins; otherwise the device setting is used.
// Loaded in <head> without defer so the saved theme applies before the page paints.
(() => {
  const root = document.documentElement;
  try { const saved = localStorage.getItem('theme'); if (saved) root.dataset.theme = saved; } catch {}
  const isDark = () => (root.dataset.theme || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')) === 'dark';
  const label = (btn) => {
    btn.textContent = isDark() ? '☀' : '☾';
    btn.setAttribute('aria-label', isDark() ? 'Switch to light mode' : 'Switch to dark mode');
  };
  addEventListener('DOMContentLoaded', () => {
    const btn = document.querySelector('.theme-toggle');
    if (!btn) return;
    btn.hidden = false;
    label(btn);
    btn.addEventListener('click', () => {
      root.dataset.theme = isDark() ? 'light' : 'dark';
      try { localStorage.setItem('theme', root.dataset.theme); } catch {}
      label(btn);
    });
  });
})();
