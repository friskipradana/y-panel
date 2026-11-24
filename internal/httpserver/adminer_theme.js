(function () {
  function getInitialTheme() {
    try {
      var stored = localStorage.getItem('reneo-adminer-theme');
      if (stored === 'dark' || stored === 'light') return stored;
      var raw = localStorage.getItem('reneo-theme');
      if (raw && raw.indexOf('"dark"') !== -1) return 'dark';
    } catch (e) {}
    return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }

  function applyTheme(mode) {
    document.documentElement.setAttribute('data-theme', mode);
    try {
      localStorage.setItem('reneo-adminer-theme', mode);
    } catch (e) {}
    var btn = document.getElementById('reneo-theme-toggle');
    if (btn) btn.textContent = mode === 'dark' ? 'Light' : 'Dark';
  }

  applyTheme(getInitialTheme());

  document.addEventListener('DOMContentLoaded', function () {
    // Clean sidebar brand title
    var h1 = document.querySelector('#menu h1 a');
    if (h1) h1.textContent = 'Reneo Database';

    // Add Light/Dark toggle inside the top-right logout bar
    var logoutBar = document.querySelector('.logout');
    if (logoutBar && !document.getElementById('reneo-theme-toggle')) {
      var btn = document.createElement('button');
      btn.id = 'reneo-theme-toggle';
      btn.type = 'button';
      btn.className = 'reneo-theme-btn';
      btn.textContent = document.documentElement.getAttribute('data-theme') === 'dark' ? 'Light' : 'Dark';
      btn.addEventListener('click', function () {
        var cur = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
        applyTheme(cur);
      });
      logoutBar.insertBefore(btn, logoutBar.firstChild);
    }
  });
})();
