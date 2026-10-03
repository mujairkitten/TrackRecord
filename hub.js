/* ------------------------------------------------------------------
 * Carotene hub — theme switches and the About modal.
 *
 * Classic script, no modules, no imports. Same-origin only, so it runs
 * under the hub's own script-src 'self' CSP.
 *
 * Theming mirrors Track Record exactly: body.light / body.dirt carry the
 * same tokens and values as the app's style.css. Preference order:
 *   1. the hub's own stored choice (localStorage "carotene-hub-theme"),
 *   2. Track Record's stored choice ("trackrecord-settings-v1", same
 *      origin) when the visitor has already picked one there,
 *   3. the system prefers-color-scheme.
 * ------------------------------------------------------------------ */
(function () {
  'use strict';

  var LS_KEY = 'carotene-hub-theme';
  var TR_KEY = 'trackrecord-settings-v1';

  function readTheme() {
    try {
      var raw = localStorage.getItem(LS_KEY);
      if (raw) {
        var t = JSON.parse(raw);
        return { light: !!t.light, dirt: !!t.dirt };
      }
    } catch (e) { /* storage unavailable: fall through */ }
    try {
      var tr = JSON.parse(localStorage.getItem(TR_KEY) || 'null');
      if (tr && typeof tr.lightMode === 'boolean') {
        return { light: tr.lightMode, dirt: tr.colorTheme === 'dirt' };
      }
    } catch (e2) { /* fall through */ }
    var mq = window.matchMedia ? window.matchMedia('(prefers-color-scheme: light)') : null;
    return { light: !!(mq && mq.matches), dirt: false };
  }

  function saveTheme(t) {
    try { localStorage.setItem(LS_KEY, JSON.stringify(t)); } catch (e) { /* ignore */ }
  }

  /* ---- theme toggle buttons (injected into the rail meta) ---- */

  var SVG_SUN = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="4.2"/><path d="M12 2.5v2.3M12 19.2v2.3M2.5 12h2.3M19.2 12h2.3M5 5l1.6 1.6M17.4 17.4L19 19M19 5l-1.6 1.6M6.6 17.4L5 19"/></svg>';
  var SVG_MOON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 14.2A8.2 8.2 0 0 1 9.8 4 8.2 8.2 0 1 0 20 14.2Z"/></svg>';
  var SVG_THEME = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3.5" y="5" width="8.2" height="14" rx="2" fill="#22b573"/><rect x="12.3" y="5" width="8.2" height="14" rx="2" fill="#e0a640"/></svg>';

  function makeToggle(id, label) {
    var b = document.createElement('button');
    b.type = 'button';
    b.id = id;
    b.className = 'rail-toggle';
    b.setAttribute('aria-label', label);
    return b;
  }

  var theme = readTheme();

  var meta = document.querySelector('.rail-meta');
  var modeBtn = makeToggle('hub-mode-btn', 'Toggle light/dark mode');
  var themeBtn = makeToggle('hub-theme-btn', 'Toggle Turf/Dirt color theme');
  themeBtn.innerHTML = SVG_THEME;
  if (meta) {
    meta.insertBefore(themeBtn, meta.firstChild);
    meta.insertBefore(modeBtn, meta.firstChild);
  }

  function syncThemeButtons(t) {
    modeBtn.innerHTML = t.light ? SVG_MOON : SVG_SUN;
    modeBtn.setAttribute('aria-pressed', t.light ? 'true' : 'false');
    themeBtn.setAttribute('aria-pressed', t.dirt ? 'true' : 'false');
  }

  function applyTheme(t) {
    document.body.classList.toggle('light', t.light);
    document.body.classList.toggle('dirt', t.dirt);
    syncThemeButtons(t);
  }

  modeBtn.addEventListener('click', function () {
    theme.light = !theme.light;
    saveTheme(theme);
    applyTheme(theme);
  });
  themeBtn.addEventListener('click', function () {
    theme.dirt = !theme.dirt;
    saveTheme(theme);
    applyTheme(theme);
  });

  applyTheme(theme);

  /* ---- About modal (like Track Record's own) ---- */

  var about = document.getElementById('about');
  var aboutClose = document.getElementById('about-close');
  var aboutLink = document.querySelector('.rail-about');
  var opener = null;

  function setPageInert(on) {
    var tools = document.getElementById('tools');
    var brand = document.querySelector('.brand');
    var skip = document.querySelector('.skip-link');
    if (tools) tools.inert = on;
    if (brand) brand.inert = on;
    if (skip) skip.inert = on;
  }

  function focusables() {
    return Array.prototype.filter.call(
      about.querySelectorAll('a[href], button:not([disabled])'),
      function (el) { return el.getClientRects().length > 0; }
    );
  }

  function openAbout() {
    if (about.classList.contains('show')) return;
    opener = document.activeElement;
    about.classList.add('show');
    document.body.classList.add('modal-open');
    setPageInert(true);
    aboutClose.focus();
  }

  function closeAbout() {
    if (!about.classList.contains('show')) return;
    about.classList.remove('show');
    document.body.classList.remove('modal-open');
    setPageInert(false);
    if (opener && opener.isConnected && !opener.closest('[inert]')) opener.focus();
    else if (aboutLink) aboutLink.focus();
  }

  if (aboutLink) {
    aboutLink.addEventListener('click', function (e) {
      e.preventDefault();
      openAbout();
    });
  }
  if (aboutClose) aboutClose.addEventListener('click', closeAbout);
  about.addEventListener('click', function (e) {
    if (e.target === about) closeAbout();
  });

  document.addEventListener('keydown', function (e) {
    if (!about.classList.contains('show')) return;
    if (e.key === 'Escape') {
      e.stopPropagation();
      closeAbout();
      return;
    }
    if (e.key === 'Tab') {
      var f = focusables();
      if (f.length === 0) return;
      var first = f[0];
      var last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
  });

  // Old #about links (from before the modal) still land here.
  if (window.location.hash === '#about') {
    try { history.replaceState(null, '', window.location.pathname + window.location.search); } catch (e) { /* ignore */ }
    openAbout();
  }
})();
