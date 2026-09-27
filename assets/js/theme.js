(function () {
  var STORAGE_KEY = '3324z-theme';
  var root = document.documentElement;
  var toggle = document.getElementById('theme-toggle');

  function getTheme() {
    return root.dataset.theme === 'dark' ? 'dark' : 'light';
  }

  function setTheme(theme) {
    var next = theme === 'dark' ? 'dark' : 'light';
    root.dataset.theme = next;
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch (e) {
      /* ignore quota / private mode */
    }
    syncToggle(next);
    window.dispatchEvent(new CustomEvent('themechange', { detail: { theme: next } }));
  }

  function syncToggle(theme) {
    if (!toggle) return;
    var isDark = theme === 'dark';
    toggle.setAttribute('aria-pressed', isDark ? 'true' : 'false');
    toggle.setAttribute(
      'aria-label',
      isDark ? 'Switch to light theme' : 'Switch to dark theme'
    );
  }

  syncToggle(getTheme());

  if (toggle) {
    toggle.addEventListener('click', function () {
      setTheme(getTheme() === 'dark' ? 'light' : 'dark');
    });
  }
})();
