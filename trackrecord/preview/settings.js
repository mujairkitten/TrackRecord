import { state, saveState, normalizeImportedTrainees, normalizeSettings, traineeNameKey, wireTabArrowNav, showToast, announce, MAX_MY_LIST, MAX_IMPORT_TRAINEES, MAX_IMPORT_TROPHIES, MAX_STORED_BYTES } from './core.js';
import { renderMainView } from './render-bus.js';

const NAVBAR_POSITIONS_DESKTOP = ['left', 'bottom', 'right', 'top'];
const NAVBAR_POSITIONS_MOBILE = ['top', 'bottom'];

function isDesktopViewport() {
  return window.matchMedia('(min-width: 960px)').matches;
}

function activeNavbarPosition() {
  return isDesktopViewport()
    ? state.settings.navbarPositionDesktop
    : state.settings.navbarPositionMobile;
}

/* ---------- Topbar sizing ---------- */

export function syncTopbarHeight() {
  const topbar = document.querySelector('.topbar');
  if (!topbar) return;
  // In left/right mode the bar is a full-height rail — measuring it would
  // push --topbar-h consumers (toast offset) off-screen. Measure the pill.
  const vertical = document.body.classList.contains('nav-left')
    || document.body.classList.contains('nav-right');
  const target = (vertical ? topbar.querySelector('.topbar-actions') : null) || topbar;
  const height = target.getBoundingClientRect().height;
  document.documentElement.style.setProperty('--topbar-h', `${height}px`);
}

/* ---------- Buttons ---------- */

function updateRailViewButton() {
  const button = document.getElementById('rail-view-btn');
  if (!button) return;
  const isCalendar = !!state.settings.calendarViewMode;
  const label = isCalendar ? 'Database' : 'Calendar View';
  button.setAttribute('aria-label', label);
  button.removeAttribute('title');
  button.dataset.tooltip = label;
  button.innerHTML = isCalendar
    ? `<svg viewBox="0 0 24 24" fill="none" aria-hidden="true" xmlns="http://www.w3.org/2000/svg"><ellipse cx="12" cy="5" rx="7.5" ry="3" stroke="currentColor" stroke-width="2"/><path d="M4.5 5v7c0 1.66 3.36 3 7.5 3s7.5-1.34 7.5-3V5M4.5 12v7c0 1.66 3.36 3 7.5 3s7.5-1.34 7.5-3v-7" stroke="currentColor" stroke-width="2"/></svg>`
    : `<svg viewBox="0 0 24 24" fill="none" aria-hidden="true" xmlns="http://www.w3.org/2000/svg"><rect x="3" y="5" width="18" height="16" rx="2" stroke="currentColor" stroke-width="2"/><path d="M3 10H21M8 3V7M16 3V7" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>`;
}

function updateAppearanceToggles() {
  const modeBtn = document.getElementById('mode-toggle-btn');
  if (modeBtn) modeBtn.setAttribute('aria-pressed', state.settings.lightMode ? 'true' : 'false');
  const themeBtn = document.getElementById('theme-toggle-btn');
  if (themeBtn) themeBtn.setAttribute('aria-pressed', state.settings.colorTheme === 'dirt' ? 'true' : 'false');
}

function refreshNavPositionButtons() {
  const desktop = isDesktopViewport();
  const activePos = activeNavbarPosition();
  document.querySelectorAll('.nav-pos-btn').forEach(btn => {
    const pos = btn.dataset.pos;
    const desktopOnly = pos === 'left' || pos === 'right';
    btn.disabled = !desktop && desktopOnly;
    const isActive = pos === activePos;
    btn.classList.toggle('active', isActive);
    btn.setAttribute('aria-pressed', isActive ? 'true' : 'false');
  });
}

/* ---------- Settings UI ---------- */

// N8: close the settings popover when focus leaves it (keyboard tab-out).
const settingsPanelDismissWired = new WeakSet();
function wireSettingsPanelDismiss(panel) {
  if (!panel || settingsPanelDismissWired.has(panel)) return;
  settingsPanelDismissWired.add(panel);
  panel.addEventListener('focusout', (e) => {
    if (!panel.classList.contains('show')) return;
    const next = e.relatedTarget;
    if (!next) return;
    if (panel.contains(next)) return;
    const btn = document.getElementById('settings-btn');
    if (btn && btn.contains(next)) return;
    closeSettingsPanel();
  });
}

export function applySettingsUI() {
  const trainToggle = document.getElementById('toggle-custom-trainee');
  const trophyToggle = document.getElementById('toggle-custom-trophy');
  const trainRow = document.getElementById('custom-trainee-row');
  const settingsBtn = document.getElementById('settings-btn');
  const backupBtn = document.getElementById('backup-btn');
  const settingsPanel = document.getElementById('settings-panel');

  document.body.classList.toggle('light', !!state.settings.lightMode);
  document.body.classList.toggle('dirt', state.settings.colorTheme === 'dirt');

  if (trainToggle) trainToggle.checked = !!state.settings.allowCustomTrainees;
  if (trophyToggle) trophyToggle.checked = !!state.settings.allowCustomTrophies;

  if (trainRow) {
    trainRow.style.display = state.settings.allowCustomTrainees ? '' : 'none';
  }

  if (settingsBtn) settingsBtn.style.display = '';
  if (backupBtn) backupBtn.style.display = '';
  if (settingsPanel) {
    wireSettingsPanelDismiss(settingsPanel);
    if (!settingsPanel.classList.contains('show')) {
      settingsPanel.inert = true;
      settingsPanel.setAttribute('aria-hidden', 'true');
    }
  }
  updateRailViewButton();
  updateAppearanceToggles();
  applyNavbarPosition();
}

// Reflects the current viewport's stored position onto the body, and
// syncs the 4-button group's active/disabled state. Safe to call on
// resize — it never writes state.
export function applyNavbarPosition() {
  const pos = activeNavbarPosition();
  document.body.classList.remove('nav-left', 'nav-bottom', 'nav-right', 'nav-top');
  document.body.classList.add(`nav-${pos}`);
  refreshNavPositionButtons();
}

export function closeSettingsPanel() {
  const panel = document.getElementById('settings-panel');
  const btn = document.getElementById('settings-btn');
  if (panel) {
    panel.classList.remove('show');
    panel.inert = true;
    panel.setAttribute('aria-hidden', 'true');
  }
  if (btn) btn.setAttribute('aria-expanded', 'false');
}

function openSettingsPanel() {
  const panel = document.getElementById('settings-panel');
  const btn = document.getElementById('settings-btn');
  if (panel) {
    panel.classList.add('show');
    panel.inert = false;
    panel.removeAttribute('aria-hidden');
  }
  if (btn) btn.setAttribute('aria-expanded', 'true');
}

export function toggleSettingsPanel() {
  const panel = document.getElementById('settings-panel');
  if (!panel) return;
  if (panel.classList.contains('show')) closeSettingsPanel();
  else openSettingsPanel();
}

export function toggleMode() {
  state.settings.lightMode = !state.settings.lightMode;
  saveState(); applySettingsUI();
  announce(state.settings.lightMode ? 'Light mode on.' : 'Dark mode on.');
}
export function toggleColorTheme() {
  state.settings.colorTheme = state.settings.colorTheme === 'dirt' ? 'turf' : 'dirt';
  saveState(); applySettingsUI();
  announce(state.settings.colorTheme === 'dirt' ? 'Dirt theme.' : 'Turf theme.');
}
export function setAllowCustomTrainees(value) {
  state.settings.allowCustomTrainees = value;
  saveState(); applySettingsUI();
}
export function setAllowCustomTrophies(value) {
  state.settings.allowCustomTrophies = value;
  saveState(); applySettingsUI(); renderMainView();
}
export function setCalendarViewMode(value) {
  state.settings.calendarViewMode = value;
  saveState(); applySettingsUI(); renderMainView();
  closeSettingsPanel();
  announce(value ? 'Calendar view.' : 'Database view.');
}

export function setNavbarPosition(pos) {
  if (isDesktopViewport()) {
    if (!NAVBAR_POSITIONS_DESKTOP.includes(pos)) return;
    state.settings.navbarPositionDesktop = pos;
  } else {
    if (!NAVBAR_POSITIONS_MOBILE.includes(pos)) return;
    state.settings.navbarPositionMobile = pos;
  }
  saveState();
  applySettingsUI();
  syncTopbarHeight();
  announce(`Navbar ${pos}.`);
}

/* ---------- Modal focus management ---------- */

const modalFocusStack = [];

function focusablesIn(container) {
  return [...container.querySelectorAll(
    'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'
  )].filter(el => el.getClientRects().length > 0);
}

function setBackgroundInert(on) {
  for (const sel of ['.wrap', '#calendar-view', '.topbar']) {
    document.querySelectorAll(sel).forEach(el => { el.inert = on; });
  }
}

function onModalKeydown(e) {
  const overlay = e.currentTarget;
  if (e.key === 'Escape') {
    e.stopPropagation();
    // Route through the specific closers so per-modal teardown runs
    // (closeBackupModal clears the export-cooldown interval).
    if (overlay.id === 'backup-overlay') closeBackupModal();
    else if (overlay.id === 'about-overlay') closeAboutModal();
    else closeModal(overlay);
    return;
  }
  if (e.key !== 'Tab') return;
  const items = focusablesIn(overlay);
  if (items.length === 0) return;
  const first = items[0];
  const last = items[items.length - 1];
  if (e.shiftKey && document.activeElement === first) {
    e.preventDefault(); last.focus();
  } else if (!e.shiftKey && document.activeElement === last) {
    e.preventDefault(); first.focus();
  }
}

function openModal(overlay, returnFocusEl) {
  if (!overlay || overlay.classList.contains('show')) return;
  // returnFocusEl lets callers capture the opener before they hide/inert it
  // (e.g. openAboutModal closes the settings panel first).
  modalFocusStack.push(returnFocusEl || document.activeElement);
  overlay.classList.add('show');
  overlay.addEventListener('keydown', onModalKeydown);
  setBackgroundInert(true);
  const target = overlay.querySelector('.modal-close');
  if (target) target.focus();
}

function closeModal(overlay) {
  if (!overlay) return;
  overlay.classList.remove('show');
  overlay.removeEventListener('keydown', onModalKeydown);
  const prev = modalFocusStack.pop();
  if (document.querySelectorAll('.modal-overlay.show').length === 0) setBackgroundInert(false);
  // The recorded opener may have become unfocusable while the modal was open
  // (e.g. it lives inside the now-inert settings panel) — fall back to a
  // sensible control instead of dropping focus to <body>.
  let target = (prev && prev.isConnected && !prev.closest('[inert]')) ? prev : null;
  if (!target) {
    if (overlay.id === 'about-overlay') target = document.getElementById('settings-btn');
    else if (overlay.id === 'backup-overlay') target = document.getElementById('backup-btn');
  }
  if (target) {
    target.focus();
  }
}

/* ---------- About modal ---------- */

export function openAboutModal() {
  // Capture the opener before closeSettingsPanel() inerts it.
  const opener = document.activeElement;
  closeSettingsPanel();
  openModal(document.getElementById('about-overlay'), opener);
}
export function closeAboutModal() {
  closeModal(document.getElementById('about-overlay'));
}

/* ---------- Backup modal ---------- */

function backupFilename() {
  const d = new Date();
  const pad = n => String(n).padStart(2, '0');
  const yy = pad(d.getFullYear() % 100);
  const mm = pad(d.getMonth() + 1);
  const dd = pad(d.getDate());
  const hh = pad(d.getHours());
  const mi = pad(d.getMinutes());
  const ss = pad(d.getSeconds());
  return `TrackRecord-${yy}${mm}${dd}-${hh}${mi}${ss}.json`;
}

function exportList() {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = backupFilename();
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function importListFromText(text) {
  try {
    if (typeof text !== 'string' || text.length > 2 * 1024 * 1024) throw new Error("bad format");
    const parsed = JSON.parse(text);
    if (!parsed || !Array.isArray(parsed.myList)) throw new Error("bad format");

    // Slice the RAW array first so a bloated payload burns no normalize CPU.
    const rawList = parsed.myList.slice(0, MAX_IMPORT_TRAINEES);
    const knownNames = new Set(state.myList.map(t => traineeNameKey(t.name)));
    const incoming = normalizeImportedTrainees(rawList, state.myList).filter(t => {
      const key = traineeNameKey(t.name);
      if (knownNames.has(key)) return false;
      knownNames.add(key);
      return true;
    });
    const room = Math.max(0, MAX_MY_LIST - state.myList.length);
    // Total-trophy budget: trim trailing trophies instead of importing 150k.
    let budget = MAX_IMPORT_TROPHIES;
    let trimmedTrophies = 0;
    const accepted = [];
    for (const t of incoming.slice(0, room)) {
      if (t.trophies.length > budget) {
        trimmedTrophies += t.trophies.length - budget;
        t.trophies.length = budget;
      }
      budget -= t.trophies.length;
      accepted.push(t);
    }
    const overCap = incoming.length - accepted.length;
    state.myList.push(...accepted);

    if (parsed.settings && typeof parsed.settings === 'object') {
      // Keep local UI prefs (theme, navbar); only functional settings cross over.
      const keep = {
        lightMode: state.settings.lightMode,
        colorTheme: state.settings.colorTheme,
        navbarPositionDesktop: state.settings.navbarPositionDesktop,
        navbarPositionMobile: state.settings.navbarPositionMobile,
      };
      state.settings = { ...normalizeSettings(parsed.settings, state.myList), ...keep };
    }

    saveState();
    applySettingsUI();
    renderMainView();

    const skipped = parsed.myList.length - rawList.length + (rawList.length - incoming.length);
    const parts = [`Imported ${accepted.length} trainee${accepted.length === 1 ? '' : 's'}`];
    if (skipped > 0) parts.push(`${skipped} duplicate, invalid or over-limit entr${skipped === 1 ? 'y was' : 'ies were'} skipped`);
    if (overCap > 0) parts.push(`list capped at ${MAX_MY_LIST}`);
    if (trimmedTrophies > 0) parts.push(`${trimmedTrophies} trophies trimmed to fit the ${MAX_IMPORT_TROPHIES} budget`);
    showToast(parts.join('. ') + '.');
    return true;
  } catch (e) {
    showToast("Couldn't read that — expected a Track Record export.", { kind: 'error' });
    return false;
  }
}

function importList(file, onDone) {
  if (!file) return;
  if (typeof file.size === 'number' && file.size > MAX_STORED_BYTES) {
    showToast("That file is too large — expected a Track Record export under 2MB.", { kind: 'error' });
    if (typeof onDone === 'function') onDone(false);
    return;
  }
  const reader = new FileReader();
  reader.onload = () => {
    const ok = importListFromText(reader.result);
    if (typeof onDone === 'function') onDone(ok);
  };
  reader.readAsText(file);
}

function refreshBackupExportText() {
  const textarea = document.getElementById('backup-export-text');
  if (textarea) textarea.value = JSON.stringify(state, null, 2);
  const stamp = document.getElementById('backup-export-stamp');
  if (stamp) {
    const d = new Date();
    const pad = n => String(n).padStart(2, '0');
    stamp.textContent = `Generated ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())} · ${state.myList.length} trainees`;
  }
}

export function openBackupModal() {
  closeSettingsPanel();
  const backupOverlay = document.getElementById('backup-overlay');
  const exportPanel = document.getElementById('backup-export-panel');
  const importPanel = document.getElementById('backup-import-panel');
  const tabs = document.querySelectorAll('#backup-tabs .cal-tab-btn');
  tabs.forEach(t => {
    const on = t.dataset.tab === 'export';
    t.classList.toggle('active', on);
    t.setAttribute('aria-selected', on ? 'true' : 'false');
  });
  if (exportPanel) exportPanel.style.display = '';
  if (importPanel) importPanel.style.display = 'none';
  refreshBackupExportText();
  openModal(backupOverlay);
}
export function closeBackupModal() {
  closeModal(document.getElementById('backup-overlay'));
  if (exportCooldownInterval) {
    clearInterval(exportCooldownInterval);
    exportCooldownInterval = null;
  }
}

let exportCooldownUntil = 0;
let exportCooldownInterval = null;

function updateExportButtonState() {
  const btn = document.getElementById('backup-export-file-btn');
  if (!btn) return;
  const remaining = Math.ceil((exportCooldownUntil - Date.now()) / 1000);
  if (remaining > 0) {
    btn.disabled = true;
    btn.textContent = `Export file (${remaining}s)`;
  } else {
    btn.disabled = false;
    btn.textContent = 'Export file';
  }
}

function startExportCooldown() {
  exportCooldownUntil = Date.now() + 10000;
  updateExportButtonState();
  if (exportCooldownInterval) clearInterval(exportCooldownInterval);
  exportCooldownInterval = setInterval(() => {
    updateExportButtonState();
    if (Date.now() >= exportCooldownUntil) {
      clearInterval(exportCooldownInterval);
      exportCooldownInterval = null;
    }
  }, 500);
}

export function wireBackupModal() {
  const backupOverlay = document.getElementById('backup-overlay');
  const backupClose = document.getElementById('backup-close');
  const tabsEl = document.getElementById('backup-tabs');
  const tabs = document.querySelectorAll('#backup-tabs .cal-tab-btn');
  const exportPanel = document.getElementById('backup-export-panel');
  const importPanel = document.getElementById('backup-import-panel');
  const exportFileBtn = document.getElementById('backup-export-file-btn');
  const importTextBtn = document.getElementById('backup-import-text-btn');
  const importTextarea = document.getElementById('backup-import-text');
  const importFileInput = document.getElementById('backup-import-file');

  if (backupOverlay) {
    backupOverlay.addEventListener('click', (e) => {
      if (e.target === backupOverlay) closeBackupModal();
    });
  }
  if (backupClose) backupClose.addEventListener('click', closeBackupModal);

  if (tabsEl) wireTabArrowNav(tabsEl);
  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      tabs.forEach(t => {
        const on = t === tab;
        t.classList.toggle('active', on);
        t.setAttribute('aria-selected', on ? 'true' : 'false');
      });
      const isExport = tab.dataset.tab === 'export';
      if (exportPanel) exportPanel.style.display = isExport ? '' : 'none';
      if (importPanel) importPanel.style.display = isExport ? 'none' : '';
      if (isExport) refreshBackupExportText();
    });
  });

  if (exportFileBtn) exportFileBtn.addEventListener('click', () => {
    if (Date.now() < exportCooldownUntil) {
      const remaining = Math.ceil((exportCooldownUntil - Date.now()) / 1000);
      showToast(`Export is on cooldown — ready in ${remaining}s.`);
      return;
    }
    exportList();
    showToast(`Exported ${state.myList.length} trainee${state.myList.length === 1 ? '' : 's'}. Next export available in 10s.`);
    startExportCooldown();
  });

  const copyBtn = document.getElementById('backup-copy-btn');
  if (copyBtn) copyBtn.addEventListener('click', async () => {
    const textarea = document.getElementById('backup-export-text');
    if (!textarea) return;
    try {
      await navigator.clipboard.writeText(textarea.value);
      showToast('Backup JSON copied to clipboard.');
    } catch (_) {
      textarea.select();
      try {
        document.execCommand('copy');
        showToast('Backup JSON copied to clipboard.');
      } catch (__) {
        showToast('Copy failed — select the text manually.', { kind: 'error' });
      }
    }
  });

  const importError = document.getElementById('backup-import-error');
  const setImportError = (message) => {
    if (importTextarea) {
      if (message) importTextarea.setAttribute('aria-invalid', 'true');
      else importTextarea.removeAttribute('aria-invalid');
    }
    if (!importError) return;
    if (message) {
      importError.textContent = message;
      importError.hidden = false;
    } else {
      importError.textContent = '';
      importError.hidden = true;
    }
  };

  if (importTextBtn) importTextBtn.addEventListener('click', () => {
    if (!importTextarea) return;
    const text = importTextarea.value.trim();
    if (!text) {
      showToast('Paste an export first, then import.');
      importTextarea.focus();
      return;
    }
    if (importListFromText(text)) {
      importTextarea.value = '';
      setImportError('');
    } else {
      setImportError("Couldn't read that — expected a Track Record export. Nothing was changed.");
    }
  });
  if (importTextarea) importTextarea.addEventListener('input', () => setImportError(''));

  if (importFileInput) importFileInput.addEventListener('change', e => {
    if (e.target.files[0]) {
      importList(e.target.files[0], (ok) => setImportError(ok ? '' : "Couldn't read that file — expected a Track Record export. Nothing was changed."));
    }
    e.target.value = '';
  });
}