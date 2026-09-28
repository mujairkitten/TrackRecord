import { state, loadState, debounce, wireChips } from './core.js';
import { setRenderHandlers } from './render-bus.js';
import { renderDatabase, renderMyList, wireStandardViewControls } from './standard-view.js';
import { renderCalendarView, closeCalTraineePanel } from './calendar.js';
import {
  applySettingsUI, closeSettingsPanel, toggleSettingsPanel,
  openAboutModal, closeAboutModal, openBackupModal, closeBackupModal,
  toggleMode, toggleColorTheme, setAllowCustomTrainees, setAllowCustomTrophies,
  setCalendarViewMode, setNavbarPosition, applyNavbarPosition,
  syncTopbarHeight, wireBackupModal
} from './settings.js';

function updateJumpButtons() {
  const top = document.getElementById('jump-top-btn');
  const bottom = document.getElementById('jump-bottom-btn');
  if (!top && !bottom) return;
  const y = window.scrollY || 0;
  const max = document.documentElement.scrollHeight - window.innerHeight;
  if (top) top.disabled = y <= 4;
  if (bottom) bottom.disabled = y >= max - 4;
}

function renderMainView() {
  const standard = document.getElementById('standard-view');
  const calView = document.getElementById('calendar-view');
  const skip = document.querySelector('.skip-link');
  if (state.settings.calendarViewMode) {
    if (standard) standard.style.display = 'none';
    if (calView) calView.style.display = '';
    if (skip) skip.setAttribute('href', '#calendar-view');
    renderCalendarView();
  } else {
    if (standard) standard.style.display = '';
    if (calView) calView.style.display = 'none';
    if (skip) skip.setAttribute('href', '#standard-view');
    renderDatabase();
    renderMyList();
  }
  updateJumpButtons();
}

function closeCarotenePanel() {
  const panel = document.getElementById('carotene-panel');
  const btn = document.getElementById('carotene-btn');
  if (!panel || !panel.classList.contains('open')) return;
  panel.classList.remove('open');
  panel.setAttribute('aria-hidden', 'true');
  if (btn) btn.setAttribute('aria-expanded', 'false');
}

async function init() {
  console.info('build v5.0.2');
  setRenderHandlers({
    mainView: renderMainView,
    myList: () => { if (!state.settings.calendarViewMode) renderMyList(); },
    database: () => { if (!state.settings.calendarViewMode) renderDatabase(); },
  });

  await loadState();
  applySettingsUI();
  renderMainView();

  wireStandardViewControls();
  wireBackupModal();
  syncTopbarHeight();
  if (document.fonts && document.fonts.ready && typeof document.fonts.ready.then === 'function') {
    document.fonts.ready.then(() => syncTopbarHeight());
  }
  window.addEventListener('resize', debounce(() => {
    applyNavbarPosition();
    syncTopbarHeight();
    updateJumpButtons();
  }, 150));

  const aboutOverlay = document.getElementById('about-overlay');
  const aboutClose = document.getElementById('about-close');
  const aboutBtn = document.getElementById('about-btn');
  if (aboutBtn) aboutBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    closeCalTraineePanel();
    openAboutModal();
  });
  if (aboutOverlay) {
    aboutOverlay.addEventListener('click', (e) => {
      if (e.target === aboutOverlay) closeAboutModal();
    });
  }
  if (aboutClose) aboutClose.addEventListener('click', closeAboutModal);

  const settingsBtn = document.getElementById('settings-btn');
  const settingsPanel = document.getElementById('settings-panel');
  if (settingsBtn && settingsPanel) {
    settingsBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      closeCalTraineePanel();
      closeCarotenePanel();
      toggleSettingsPanel();
    });

    // Settings-panel-scoped click handler: keeps clicks inside the panel
    // from closing it, AND routes nav-position button clicks. The old
    // document-level delegation never fired because stopPropagation()
    // killed the event before it reached document.
    settingsPanel.addEventListener('click', (e) => {
      e.stopPropagation();
      const navBtn = e.target.closest('.nav-pos-btn');
      if (navBtn && !navBtn.disabled) {
        setNavbarPosition(navBtn.dataset.pos);
      }
    });

    wireChips(settingsPanel);
  }

  const backupBtn = document.getElementById('backup-btn');
  if (backupBtn) backupBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    closeCalTraineePanel();
    openBackupModal();
  });

  const modeToggleBtn = document.getElementById('mode-toggle-btn');
  const themeToggleBtn = document.getElementById('theme-toggle-btn');
  const caroteneBtn = document.getElementById('carotene-btn');
  const railViewBtn = document.getElementById('rail-view-btn');
  const trainToggle = document.getElementById('toggle-custom-trainee');
  const trophyToggle = document.getElementById('toggle-custom-trophy');

  if (modeToggleBtn) modeToggleBtn.addEventListener('click', toggleMode);
  if (themeToggleBtn) themeToggleBtn.addEventListener('click', toggleColorTheme);

  if (caroteneBtn) caroteneBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    const panel = document.getElementById('carotene-panel');
    if (!panel) return;
    const isOpen = panel.classList.toggle('open');
    panel.setAttribute('aria-hidden', isOpen ? 'false' : 'true');
    caroteneBtn.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
    if (isOpen) closeSettingsPanel();
  });
  if (caroteneBtn) caroteneBtn.setAttribute('aria-expanded', 'false');

  if (railViewBtn) railViewBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    const showCalendar = !state.settings.calendarViewMode;
    setCalendarViewMode(showCalendar);
    if (!showCalendar) requestAnimationFrame(() => {
      const reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      document.getElementById('db-grid')?.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'start' });
    });
  });

  const scrollBehavior = () => (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth');
  const jumpTopBtn = document.getElementById('jump-top-btn');
  const jumpBottomBtn = document.getElementById('jump-bottom-btn');
  if (jumpTopBtn) jumpTopBtn.addEventListener('click', () => {
    window.scrollTo({ top: 0, behavior: scrollBehavior() });
  });
  if (jumpBottomBtn) jumpBottomBtn.addEventListener('click', () => {
    window.scrollTo({ top: document.documentElement.scrollHeight, behavior: scrollBehavior() });
  });
  let jumpRaf = 0;
  window.addEventListener('scroll', () => {
    if (jumpRaf) return;
    jumpRaf = requestAnimationFrame(() => { jumpRaf = 0; updateJumpButtons(); });
  }, { passive: true });
  if (window.ResizeObserver) {
    new ResizeObserver(() => updateJumpButtons()).observe(document.body);
  }
  updateJumpButtons();

  if (trainToggle) trainToggle.addEventListener('change', () => setAllowCustomTrainees(trainToggle.checked));
  if (trophyToggle) trophyToggle.addEventListener('change', () => setAllowCustomTrophies(trophyToggle.checked));

  document.addEventListener('click', (e) => {
    const panel = document.getElementById('carotene-panel');
    const btn = document.getElementById('carotene-btn');
    if (panel && btn) {
      const target = e.target;
      if (!panel.contains(target) && !btn.contains(target) && panel.classList.contains('open')) {
        panel.classList.remove('open');
        panel.setAttribute('aria-hidden', 'true');
        btn.setAttribute('aria-expanded', 'false');
      }
    }
    closeSettingsPanel();
    closeCalTraineePanel();
  });

  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    closeCarotenePanel();
    closeAboutModal();
    closeBackupModal();
    closeSettingsPanel();
    if (closeCalTraineePanel()) document.getElementById('cal-trainee-btn')?.focus();
  });
}
init();