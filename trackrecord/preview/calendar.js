import { DATABASE } from '../data/database.js';
import { RACES, TRACK_TO_APT_KEY, DIST_TO_APT_KEY } from '../data/races.js';
import {
  state, saveState, uid, escapeHtml, escapeAttr, gradeOf, GRADE_INFO, iconHtml, blankIconHtml,
  aptGroupsHtml, wireChips, wireTabArrowNav, sortRowsByMode, raceDateLabel, debounce, tagFgForVar,
  withFocusKept, showToast, announce,
  addToMyList, removeFromMyList, removeTrophy, setTrophyChecked, findRaceByExactName, traineeNameKey
} from './core.js';
import {
  closeSettingsPanel,
  toggleMode, toggleColorTheme, setAllowCustomTrainees,
  setAllowCustomTrophies, setCalendarViewMode, openBackupModal, openAboutModal
} from './settings.js';

export const CAL_YEAR_GROUPS = ["Junior", "Classic", "Senior"];
const CAL_MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const CAL_TURNS = ["Early", "Late"];

function raceAppliesToYear(race, yearGroup) {
  return race.year.split(",").map(s => s.trim()).includes(yearGroup);
}
function calSlotKey(month, turn) { return `${month}|${turn}`; }

const SLOT_RACE_MAP = (() => {
  const map = new Map();
  for (const yearGroup of CAL_YEAR_GROUPS) {
    for (const month of CAL_MONTHS) {
      for (const turn of CAL_TURNS) {
        const key = `${yearGroup}|${calSlotKey(month, turn)}`;
        map.set(key, RACES.filter(r => raceAppliesToYear(r, yearGroup) && r.month === month && r.turn === turn));
      }
    }
  }
  return map;
})();

function racesForSlot(yearGroup, month, turn) {
  return SLOT_RACE_MAP.get(`${yearGroup}|${calSlotKey(month, turn)}`) || [];
}
function trophyForRace(t, raceName) {
  const key = traineeNameKey(raceName);
  return t.trophies.find(x => traineeNameKey(x.name) === key);
}
function isRaceDone(t, raceName) {
  const tr = trophyForRace(t, raceName);
  return !!(tr && tr.checked);
}
function pendingOrderForSlot(t, slotKey, pendingRaces) {
  const byName = new Map(pendingRaces.map(r => [r.name, r]));
  const saved = (t.calendarOrder && t.calendarOrder[slotKey]) || [];
  const savedRaces = saved.map(n => byName.get(n)).filter(Boolean);
  const savedNames = new Set(savedRaces.map(r => r.name));
  const rest = pendingRaces.filter(r => !savedNames.has(r.name));
  return [...savedRaces, ...rest];
}
function isKnownRaceName(name) {
  return RACES.some(r => r.name === name);
}
function reorderRaceInSlot(t, slotKey, allSlotRaces, draggedName, targetName) {
  if (!isKnownRaceName(draggedName)) return;
  if (targetName && !isKnownRaceName(targetName)) targetName = null;
  const pending = allSlotRaces.filter(r => !isRaceDone(t, r.name));
  let ordered = pendingOrderForSlot(t, slotKey, pending).map(r => r.name);
  ordered = ordered.filter(n => n !== draggedName);
  if (targetName && ordered.includes(targetName)) {
    ordered.splice(ordered.indexOf(targetName), 0, draggedName);
  } else {
    ordered.push(draggedName);
  }
  if (!t.calendarOrder) t.calendarOrder = {};
  t.calendarOrder[slotKey] = ordered;
  saveState();
}
let dragCtx = null;
function calendarToggleRace(t, race) {
  let tr = trophyForRace(t, race.name);
  if (!tr) {
    tr = { id: uid(), name: race.name, checked: true, grade: race.grade, track: race.track, distance: race.distance, year: race.year, turn: race.turn, month: race.month };
    t.trophies.push(tr);
    showToast(`Added ${race.name} to ${t.name}'s list.`);
  } else {
    tr.checked = !tr.checked;
  }
  saveState();
}
function addRaceToListUnchecked(t, race) {
  if (trophyForRace(t, race.name)) return;
  const trophy = { id: uid(), name: race.name, checked: false, grade: race.grade, track: race.track, distance: race.distance, year: race.year, turn: race.turn, month: race.month };
  t.trophies.push(trophy);
  saveState();
  showToast(`Added ${race.name} to ${t.name}'s list.`, {
    actionLabel: 'Undo',
    duration: 8000,
    onAction: () => removeTrophy(t.id, trophy.id)
  });
}

let calViewTab = "Junior";

let calTraineePanelOpen = false;
let calTraineePanelRevealed = false;
let calTraineePanelJustOpened = false;
let calTraineeSearch = "";
let calTraineeSort = "default";

let moreToolsOpen = !window.matchMedia('(max-width: 720px)').matches;
let moreToolsRevealed = moreToolsOpen;

const CAL_EMPTY_TRAINEE = {
  id: "__empty__",
  name: "Add Trainee Here...",
  aptitudes: { turf: "A", dirt: "A", sprint: "A", mile: "A", medium: "A", long: "A" },
  trophies: []
};

function sortTraineeRows(rows) {
  return sortRowsByMode(rows, calTraineeSort);
}

export function calGradeColor(grade) {
  if (grade === 'G1') return 'var(--g1)';
  if (grade === 'G2') return 'var(--g2)';
  return 'var(--g3)';
}
// Only G1 blue is dark enough to need white text (G2/G3 read best dark).
export function calGradeFg(grade) {
  return grade === 'G1' ? '#fff' : '#12141a';
}
function calRaceRowHtml(r, opts) {
  const draggable = !!opts.draggable;
  const checked = !!opts.checked;
  const showAdd = !!opts.showAdd;
  return `
    <div class="cal-race-row${checked ? ' done' : ''}" ${draggable ? 'draggable="true"' : ''} data-race="${escapeAttr(r.name)}">
      ${draggable ? '<span class="drag-handle" aria-hidden="true">⠿</span>' : ''}
      ${showAdd && draggable ? `<button class="cal-race-add-btn" data-race="${escapeAttr(r.name)}" aria-label="Add ${escapeAttr(r.name)} to race list, unchecked">+</button>` : ''}
      <input type="checkbox" class="cal-tick" data-race="${escapeAttr(r.name)}" aria-label="${escapeAttr(r.name)}" ${checked ? 'checked' : ''}>
      <span class="cal-grade-tag" style="background:${calGradeColor(r.grade)};color:${calGradeFg(r.grade)}">${r.grade}</span>
      <span class="cal-race-info">
        <span class="cal-race-name" title="${escapeAttr(r.name)}">${escapeHtml(r.name)}</span>
        <span class="cal-race-sub">${escapeHtml(r.track)} · ${escapeHtml(r.distance)}</span>
      </span>
      ${draggable ? `<span class="cal-race-moves" role="group" aria-label="Reorder ${escapeAttr(r.name)}">
        <button class="cal-race-move" data-move="-1" data-race="${escapeAttr(r.name)}" aria-label="Move ${escapeAttr(r.name)} up">▲</button>
        <button class="cal-race-move" data-move="1" data-race="${escapeAttr(r.name)}" aria-label="Move ${escapeAttr(r.name)} down">▼</button>
      </span>` : ''}
    </div>`;
}

function calCellHtml(t, yearGroup, month, turn, opts) {
  const slotKey = calSlotKey(month, turn);
  const slotRaces = racesForSlot(yearGroup, month, turn);
  const done = slotRaces.filter(r => isRaceDone(t, r.name));
  const pending = pendingOrderForSlot(t, slotKey, slotRaces.filter(r => !isRaceDone(t, r.name)));
  const label = `<div class="cal-cell-label">${month.slice(0, 3)} · ${turn}</div>`;

  if (slotRaces.length === 0) {
    return `<div class="cal-cell cal-cell-empty" data-slot="${slotKey}" data-year="${yearGroup}">${label}</div>`;
  }

  const pendingHtml = pending.map(r => calRaceRowHtml(r, {
    draggable: true,
    checked: false,
    showAdd: opts.showAdd && !trophyForRace(t, r.name)
  })).join("");

  const doneHtml = done.length ? `<div class="cal-done-divider">${done.map(r => calRaceRowHtml(r, { draggable: false, checked: true })).join("")}</div>` : "";

  return `<div class="cal-cell" data-slot="${slotKey}" data-year="${yearGroup}">${label}${pendingHtml}${doneHtml}</div>`;
}

function calGridHtml(t, yearGroup, opts) {
  const slots = [];
  CAL_MONTHS.forEach(month => CAL_TURNS.forEach(turn => slots.push({ month, turn })));
  const cellsHtml = slots.map(s => calCellHtml(t, yearGroup, s.month, s.turn, opts)).join("");
  return `<div class="cal-grid-46">${cellsHtml}</div>`;
}

function calOobHtml(t) {
  const oob = t.trophies.filter(tr => !tr.track);
  if (oob.length === 0) {
    return `<div class="empty-note" style="margin-top:8px;">No Out-of-Bond trophies yet — add a custom trophy from My List.</div>`;
  }
  return `<div class="cal-oob-list">${oob.map(tr => `
    <div class="trophy-item ${tr.checked ? 'checked' : ''}">
      <input type="checkbox" class="cal-oob-tick" data-tid="${tr.id}" aria-label="${escapeAttr(tr.name)}" ${tr.checked ? 'checked' : ''}>
      <span>${escapeHtml(tr.name)}</span>
    </div>`).join("")}</div>`;
}

export function calPageHtml(t, tab, opts = {}) {
  if (tab === "OoB") return calOobHtml(t);
  return calGridHtml(t, tab, opts);
}

export function wireCalPage(root, t, onChange) {
  root.querySelectorAll('.cal-race-row').forEach(row => wireRaceRow(row, t, onChange, root));

  root.querySelectorAll('.cal-cell').forEach(cell => {
    cell.addEventListener('dragover', (e) => { if (dragCtx) e.preventDefault(); });
    cell.addEventListener('drop', (e) => {
      e.preventDefault();
      if (!dragCtx) return;
      const slotKey = cell.dataset.slot;
      if (slotKey !== dragCtx.slotKey) return;
      const yearGroup = cell.dataset.year;
      const [month, turn] = slotKey.split('|');
      reorderRaceInSlot(t, slotKey, racesForSlot(yearGroup, month, turn), dragCtx.raceName, null);
      announce(`Moved ${dragCtx.raceName} in ${slotKey.split('|').join(' ')}.`);
      onChange();
    });
  });

  root.querySelectorAll('.cal-oob-tick').forEach(cb => {
    cb.addEventListener('change', () => {
      const res = setTrophyChecked(t.id, cb.dataset.tid, cb.checked);
      if (!res) { onChange(); return; }
      const row = cb.closest('.trophy-item');
      if (row) row.classList.toggle('checked', cb.checked);
    });
  });
}

function refreshRaceRow(row, t, race, onChange, root) {
  const cell = row.closest('.cal-cell');
  const done = isRaceDone(t, race.name);
  const tmp = document.createElement('div');
  tmp.innerHTML = calRaceRowHtml(race, { draggable: !done, checked: done, showAdd: false });
  const fresh = tmp.firstElementChild;
  if (!fresh || fresh.nodeType !== 1 || !cell) return;
  const slotKey = cell.dataset.slot;
  const yearGroup = cell.dataset.year;
  const [month, turn] = (slotKey || '|').split('|');
  if (done) {
    let div = cell.querySelector('.cal-done-divider');
    if (!div) {
      div = document.createElement('div');
      div.className = 'cal-done-divider';
      cell.appendChild(div);
    }
    div.appendChild(fresh);
  } else {
    const names = pendingOrderForSlot(t, slotKey, racesForSlot(yearGroup, month, turn).filter(r => !isRaceDone(t, r.name))).map(r => r.name);
    const pos = names.indexOf(race.name);
    const siblings = [...cell.querySelectorAll(':scope > .cal-race-row')];
    const before = siblings.find(r => names.indexOf(r.dataset.race) > pos);
    const div = cell.querySelector('.cal-done-divider');
    if (before) cell.insertBefore(fresh, before);
    else if (div) cell.insertBefore(fresh, div);
    else cell.appendChild(fresh);
    if (div && !div.children.length) div.remove();
  }
  row.remove();
  wireRaceRow(fresh, t, onChange, root);
  const tick = fresh.querySelector('.cal-tick');
  if (tick) tick.focus({ preventScroll: true });
  window.dispatchEvent(new CustomEvent('cb-card-progress', { detail: { id: t.id, race: race.name, checked: done } }));
}

function wireRaceRow(row, t, onChange, root) {
  const cb = row.querySelector('.cal-tick');
  if (cb) cb.addEventListener('change', () => {
    const race = RACES.find(r => r.name === cb.dataset.race);
    if (!race) return;
    calendarToggleRace(t, race);
    refreshRaceRow(row, t, race, onChange, root);
  });

  const addBtn = row.querySelector('.cal-race-add-btn');
  if (addBtn) addBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    const race = RACES.find(r => r.name === addBtn.dataset.race);
    if (race) { addRaceToListUnchecked(t, race); onChange(); }
  });

  row.querySelectorAll('.cal-race-move').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const cell = btn.closest('.cal-cell');
      if (!cell) return;
      const slotKey = cell.dataset.slot;
      const yearGroup = cell.dataset.year;
      const delta = Number(btn.dataset.move);
      if (delta !== -1 && delta !== 1) return;
      const [month, turn] = slotKey.split('|');
      const allSlotRaces = racesForSlot(yearGroup, month, turn);
      const pending = allSlotRaces.filter(r => !isRaceDone(t, r.name));
      const ordered = pendingOrderForSlot(t, slotKey, pending).map(r => r.name);
      const idx = ordered.indexOf(btn.dataset.race);
      const next = idx + delta;
      if (idx === -1 || next < 0 || next >= ordered.length) return;
      const [name] = ordered.splice(idx, 1);
      ordered.splice(next, 0, name);
      if (!t.calendarOrder) t.calendarOrder = {};
      t.calendarOrder[slotKey] = ordered;
      saveState();
      withFocusKept(() => onChange());
      const movedRace = btn.dataset.race;
      const slot = slotKey;
      showToast(`Moved ${movedRace} ${delta === -1 ? 'up' : 'down'} in ${slot.split('|').join(' ')}.`);
    });
  });

  if (row.hasAttribute('draggable')) {
    row.addEventListener('dragstart', (e) => {
      if (e.target.closest('input, button')) { e.preventDefault(); return; }
      const cell = row.closest('.cal-cell');
      dragCtx = { slotKey: cell.dataset.slot, raceName: row.dataset.race };
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', row.dataset.race);
      row.classList.add('dragging');
    });
    row.addEventListener('dragend', () => {
      row.classList.remove('dragging');
      root.querySelectorAll('.drag-over').forEach(el => el.classList.remove('drag-over'));
      dragCtx = null;
    });
    row.addEventListener('dragover', (e) => {
      if (!dragCtx) return;
      e.preventDefault();
      row.classList.add('drag-over');
    });
    row.addEventListener('dragleave', (e) => {
      if (e.relatedTarget && row.contains(e.relatedTarget)) return;
      row.classList.remove('drag-over');
    });
    row.addEventListener('drop', (e) => {
      e.preventDefault();
      e.stopPropagation();
      row.classList.remove('drag-over');
      if (!dragCtx) return;
      const cell = row.closest('.cal-cell');
      const slotKey = cell.dataset.slot;
      if (slotKey !== dragCtx.slotKey) return;
      const yearGroup = cell.dataset.year;
      const [month, turn] = slotKey.split('|');
      reorderRaceInSlot(t, slotKey, racesForSlot(yearGroup, month, turn), dragCtx.raceName, row.dataset.race);
      announce(`Moved ${dragCtx.raceName} in ${slotKey.split('|').join(' ')}.`);
      onChange();
    });
  }
}

/* ---------- Trainee picker panel ---------- */

function calTraineeListsHtml(activeTrainee) {
  const q = calTraineeSearch.trim().toLowerCase();
  const mineRows = sortTraineeRows(state.myList.filter(t => t.name.toLowerCase().includes(q)));
  // N2: use the same canonical key as addToMyList so DB names that normalise
  // to an existing entry are excluded from "All trainees".
  const myKeys = new Set(state.myList.map(t => traineeNameKey(t.name)));
  const otherRows = sortTraineeRows(DATABASE.filter(d => !myKeys.has(traineeNameKey(d.name)) && d.name.toLowerCase().includes(q)));

  const mineHtml = mineRows.map(t => `
    <div class="cal-trainee-row ${t.id === activeTrainee.id ? 'active' : ''}">
      ${iconHtml(t.name, 28)}
      <button class="cal-trainee-switch" data-switch="${t.id}" aria-label="Switch to ${escapeAttr(t.name)}">
        <span class="cal-trainee-row-name">${escapeHtml(t.name)}</span>
      </button>
      ${t.id === activeTrainee.id ? '<span class="cal-trainee-current">Current</span>' : ''}
      <button class="cal-trainee-remove" data-remove="${t.id}" aria-label="Remove ${escapeAttr(t.name)} from My List">&times;</button>
    </div>`).join("") || `<div class="cal-trainee-empty">No matches in My List.</div>`;

  const TRAINEE_CAP = 30;
  const otherHtml = otherRows.slice(0, TRAINEE_CAP).map(d => `
    <div class="cal-trainee-row">
      ${iconHtml(d.name, 28)}
      <span class="cal-trainee-row-name">${escapeHtml(d.name)}</span>
      <button class="btn small" data-addswitch="${escapeAttr(d.name)}" aria-label="Add ${escapeAttr(d.name)} to my list">+ Add to my list</button>
    </div>`).join("") + (otherRows.length > TRAINEE_CAP ? `<div class="cal-trainee-empty">Showing ${TRAINEE_CAP} of ${otherRows.length} — keep typing to narrow.</div>` : "") || `<div class="cal-trainee-empty">No matches.</div>`;

  return `
    <div class="cal-trainee-group-label">In My List</div>
    <div class="cal-trainee-list">${mineHtml}</div>
    <div class="cal-trainee-group-label">All trainees</div>
    <div class="cal-trainee-list">${otherHtml}</div>`;
}

function calTraineePanelHtml(activeTrainee) {
  // N9: this is a popover, not a modal — use `region` for the label to be valid.
  return `
  <div class="cal-trainee-panel" id="cal-trainee-panel" role="region" aria-label="Choose trainee">
    <input type="text" class="search" id="cal-trainee-search" placeholder="Search trainees…" value="${escapeAttr(calTraineeSearch)}" autocomplete="off" aria-label="Search trainees">
    <div class="cal-trainee-sort" role="group" aria-label="Trainee sort order">
      <button class="sort-btn ${calTraineeSort === 'default' ? 'active' : ''}" data-sort="default" aria-pressed="${calTraineeSort === 'default' ? 'true' : 'false'}">Default</button>
      <button class="sort-btn ${calTraineeSort === 'az' ? 'active' : ''}" data-sort="az" aria-pressed="${calTraineeSort === 'az' ? 'true' : 'false'}">A-Z</button>
      <button class="sort-btn ${calTraineeSort === 'za' ? 'active' : ''}" data-sort="za" aria-pressed="${calTraineeSort === 'za' ? 'true' : 'false'}">Z-A</button>
    </div>
    <div id="cal-trainee-lists">${calTraineeListsHtml(activeTrainee)}</div>
  </div>`;
}

function calSidebarHtml(activeTrainee, isEmpty) {
  const iconBlock = isEmpty ? blankIconHtml(72) : iconHtml(activeTrainee.name, 72);
  return `
  <div class="cal-sidebar${calTraineePanelOpen ? ' panel-open' : ''}">
    <div class="cal-trainee-card${calTraineePanelOpen ? ' panel-open' : ''}">
      <div class="cal-trainee-card-icon">${iconBlock}</div>
      <div class="cal-trainee-card-right">
        <div class="cal-trainee-card-name-row">
          <button class="cal-trainee-name-btn" id="cal-trainee-btn" aria-haspopup="dialog" aria-expanded="${calTraineePanelOpen ? 'true' : 'false'}">
            <span class="cal-trainee-name">${escapeHtml(activeTrainee.name)}</span>
            <span class="cal-trainee-arrow">
              <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M6 9l6 6 6-6" stroke="currentColor" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
            </span>
          </button>
        </div>
        ${!isEmpty ? `<div class="cal-trainee-card-chips">${aptGroupsHtml(activeTrainee.aptitudes)}</div>` : ''}
      </div>
      ${calTraineePanelOpen ? calTraineePanelHtml(activeTrainee) : ''}
    </div>
    <div class="cal-tool-box">
      <h3 class="cal-tool-box-title">Find a race</h3>
      <div class="cal-locate-wrap">
        <input type="text" class="search" id="cal-locate-input" placeholder="Search races…" autocomplete="off" aria-label="Search races" role="combobox" aria-expanded="false" aria-controls="cal-locate-suggest" aria-autocomplete="list" aria-haspopup="listbox">
        <div class="race-suggest" id="cal-locate-suggest" role="listbox" aria-label="Matching races"></div>
      </div>
    </div>
    <div class="cal-tool-box">
      <button class="cal-tool-box-toggle" id="cal-tools-toggle" aria-expanded="${moreToolsRevealed ? 'true' : 'false'}" aria-controls="cal-tools-body">
        <span class="cal-tool-box-title">More tools</span>
        <span class="cal-trainee-arrow${moreToolsRevealed ? ' open' : ''}">
          <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M6 9l6 6 6-6" stroke="currentColor" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        </span>
      </button>
      <div class="cal-tool-list${moreToolsRevealed ? ' open' : ''}" id="cal-tools-body">
        <div class="settings-group-label">Appearance</div>
        <div class="settings-row settings-row-icons">
          <button class="icon-pill-btn" id="cal-mode-toggle-btn" aria-label="Toggle light/dark mode" data-tooltip="Toggle mode">
            <svg class="icon-toggle-sun" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <circle cx="12" cy="12" r="4.2" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
              <path d="M12 2.5V5M12 19V21.5M4.2 4.2L6 6M18 18L19.8 19.8M2.5 12H5M19 12H21.5M4.2 19.8L6 18M18 6L19.8 4.2" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
            </svg>
            <svg class="icon-toggle-moon" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M20 14.5A8.5 8.5 0 1 1 9.5 4a7 7 0 0 0 10.5 10.5Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
          </button>
          <button class="icon-pill-btn" id="cal-theme-toggle-btn" aria-label="Toggle Turf/Dirt color theme" data-tooltip="Toggle color theme">
            <svg class="icon-toggle-turf" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M6 20V13C6 10 8 8 8 8C8 8 6 10 6 13" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
              <path d="M12 20V10C12 7 14 5 14 5C14 5 12 7 12 10" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
              <path d="M18 20V13C18 10 20 8 20 8C20 8 18 10 18 13" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
            <svg class="icon-toggle-dirt" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M3 18L8 9L12 15L15 10L21 18" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
              <path d="M3 20H21" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
            </svg>
          </button>
          <button class="icon-pill-btn" id="cal-exit-btn" aria-label="Exit Calendar View" data-tooltip="Exit Calendar View">
            <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M9 14L4 9L9 4" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
              <path d="M4 9H14C17.3137 9 20 11.6863 20 15C20 18.3137 17.3137 21 14 21H8" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
          </button>
        </div>
        <div class="settings-divider"></div>
        <div class="settings-group-label">Customize</div>
        <div class="settings-row">
          <span id="cal-label-custom-trainee">Custom trainees</span>
          <label class="switch"><input type="checkbox" id="cal-toggle-custom-trainee" aria-labelledby="cal-label-custom-trainee" ${state.settings.allowCustomTrainees ? 'checked' : ''}><span class="switch-slider"></span></label>
        </div>
        <div class="settings-row">
          <span id="cal-label-custom-trophy">Custom trophies</span>
          <label class="switch"><input type="checkbox" id="cal-toggle-custom-trophy" aria-labelledby="cal-label-custom-trophy" ${state.settings.allowCustomTrophies ? 'checked' : ''}><span class="switch-slider"></span></label>
        </div>
        <div class="settings-divider"></div>
        <div class="cal-tool-row-pair">
          <button class="btn small" id="cal-backup-btn">Backup</button>
          <button class="btn small" id="cal-about-btn">About</button>
        </div>
      </div>
    </div>
  </div>`;
}

function wireCalLocate(host, t) {
  const input = document.getElementById('cal-locate-input');
  const box = document.getElementById('cal-locate-suggest');
  if (!input || !box) return;
  const toolBox = input.closest('.cal-tool-box');

  const setActiveLocateItem = (item) => {
    box.querySelectorAll('.race-suggest-item.active').forEach(el => {
      el.classList.remove('active');
      el.setAttribute('aria-selected', 'false');
    });
    if (item) {
      item.classList.add('active');
      item.setAttribute('aria-selected', 'true');
      if (item.id) input.setAttribute('aria-activedescendant', item.id);
    } else {
      input.removeAttribute('aria-activedescendant');
    }
  };
  const setOpen = (open) => {
    box.classList.toggle('show', open);
    input.setAttribute('aria-expanded', open ? 'true' : 'false');
    if (!open) input.removeAttribute('aria-activedescendant');
    if (toolBox) toolBox.classList.toggle('suggest-open', open);
  };

  const showResults = () => {
    const q = input.value.trim().toLowerCase();
    if (!q) { setOpen(false); return; }
    const matches = RACES.filter(r => r.name.toLowerCase().includes(q)).slice(0, 20);
    box.innerHTML = matches.length === 0
      ? `<div class="race-suggest-empty">${state.settings.allowCustomTrophies ? "No matching race. Add it as a custom trophy from My List." : "No matching race. Custom trophies are disabled in settings."}</div>`
      : matches.map((r, i) => {
        const trackKey = TRACK_TO_APT_KEY[r.track];
        const distKey = DIST_TO_APT_KEY[r.distance];
        const trackGrade = gradeOf(t.aptitudes[trackKey]);
        const distGrade = gradeOf(t.aptitudes[distKey]);
        const trackTier = GRADE_INFO[trackGrade].tier;
        const distTier = GRADE_INFO[distGrade].tier;
        return `
        <div class="race-suggest-item" id="cal-locate-suggest-opt-${i}" role="option" tabindex="-1" aria-selected="false" data-race="${escapeAttr(r.name)}">
          <span class="race-grade-tag" style="background:${calGradeColor(r.grade)};color:${calGradeFg(r.grade)}">${escapeHtml(r.grade)}</span>
          <span class="race-info">
            <span class="race-name">${escapeHtml(r.name)}</span>
            <span class="race-date">${escapeHtml(raceDateLabel(r))}</span>
          </span>
          <span class="race-meta">
            <span class="mini-tag" style="background:var(--${trackTier});color:${tagFgForVar(trackTier)}">${escapeHtml(r.track)} ${escapeHtml(trackGrade)}</span>
            <span class="mini-tag" style="background:var(--${distTier});color:${tagFgForVar(distTier)}">${escapeHtml(r.distance)} ${escapeHtml(distGrade)}</span>
          </span>
        </div>`;
      }).join("");
    setOpen(true);
  };

  const debouncedShow = debounce(showResults, 120);
  input.addEventListener('input', debouncedShow);
  input.addEventListener('focus', showResults);
  input.addEventListener('blur', () => setTimeout(() => setOpen(false), 150));
  box.addEventListener('mouseover', (e) => {
    const item = e.target.closest('.race-suggest-item');
    if (!item) return;
    setActiveLocateItem(item);
  });
  const pickLocateItem = (e) => {
    const item = e.target.closest('.race-suggest-item');
    if (!item) return;
    if (e.type === 'mousedown') e.preventDefault();
    // mousedown is followed by click — handle once.
    const now = Date.now();
    if (e.type === 'click' && item.dataset.race === box._lastPickRace && now - (box._lastPickAt || 0) < 500) return;
    box._lastPickRace = item.dataset.race;
    box._lastPickAt = now;
    locateRaceInCalendar(item.dataset.race);
    input.value = "";
    setOpen(false);
  };
  box.addEventListener('mousedown', pickLocateItem);
  box.addEventListener('click', pickLocateItem);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      const items = [...box.querySelectorAll('.race-suggest-item')];
      if (items.length === 0) return;
      e.preventDefault();
      const active = box.querySelector('.race-suggest-item.active');
      let idx = items.indexOf(active);
      idx = e.key === 'ArrowDown' ? (idx + 1) % items.length : (idx - 1 + items.length) % items.length;
      setActiveLocateItem(items[idx]);
      items[idx].scrollIntoView({ block: 'nearest' });
    } else if (e.key === 'Enter') {
      const active = box.querySelector('.race-suggest-item.active');
      const first = box.querySelector('.race-suggest-item');
      const target = active || first;
      if (target) {
        e.preventDefault();
        locateRaceInCalendar(target.dataset.race);
        input.value = "";
        setOpen(false);
      }
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  });
}

function locateRaceInCalendar(name) {
  const race = findRaceByExactName(name);
  if (!race) return;
  if (!raceAppliesToYear(race, calViewTab)) {
    const groups = race.year.split(",").map(s => s.trim());
    calViewTab = groups[0];
  }
  const targetYear = calViewTab;
  renderCalendarView();
  requestAnimationFrame(() => {
    const slotKey = calSlotKey(race.month, race.turn);
    const cell = document.querySelector(`.cal-cell[data-slot="${CSS.escape(slotKey)}"][data-year="${CSS.escape(targetYear)}"]`);
    if (cell) {
      const smooth = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      cell.scrollIntoView({ behavior: smooth ? 'auto' : 'smooth', block: 'center' });
      cell.classList.add('cal-cell-flash');
      setTimeout(() => cell.classList.remove('cal-cell-flash'), 1600);
    }
  });
}

function wireCalTraineePanel(host, activeTrainee) {
  const btn = document.getElementById('cal-trainee-btn');
  if (btn) btn.addEventListener('click', (e) => {
    e.stopPropagation();
    closeSettingsPanel();

    if (calTraineePanelOpen) {
      calTraineePanelOpen = false;
      calTraineePanelRevealed = false;
      calTraineePanelJustOpened = false;
      const arrow = btn.querySelector('.cal-trainee-arrow');
      const panel = document.getElementById('cal-trainee-panel');
      if (arrow) arrow.classList.remove('open');
      if (panel) panel.classList.remove('open');
      btn.setAttribute('aria-expanded', 'false');
      setTimeout(renderCalendarView, 250);
    } else {
      calTraineePanelOpen = true;
      calTraineePanelJustOpened = true;
      renderCalendarView();
      const freshPanel = document.getElementById('cal-trainee-panel');
      const freshArrow = document.querySelector('#cal-trainee-btn .cal-trainee-arrow');
      const freshBtn = document.getElementById('cal-trainee-btn');
      if (freshPanel) freshPanel.getBoundingClientRect();
      requestAnimationFrame(() => {
        if (freshArrow) freshArrow.classList.add('open');
        if (freshPanel) freshPanel.classList.add('open');
        if (freshBtn) freshBtn.setAttribute('aria-expanded', 'true');
        calTraineePanelRevealed = true;
      });
    }
  });

  const panel = document.getElementById('cal-trainee-panel');
  if (!panel) return;

  panel.addEventListener('click', e => e.stopPropagation());

  if (calTraineePanelOpen && calTraineePanelRevealed) {
    const arrow = document.querySelector('#cal-trainee-btn .cal-trainee-arrow');
    panel.classList.add('open');
    if (arrow) arrow.classList.add('open');
  }

  const searchInput = document.getElementById('cal-trainee-search');
  if (searchInput) {
    if (calTraineePanelJustOpened) {
      calTraineePanelJustOpened = false;
      searchInput.focus();
      const len = searchInput.value.length;
      searchInput.setSelectionRange(len, len);
    }
    searchInput.addEventListener('input', debounce(() => {
      calTraineeSearch = searchInput.value;
      const listHost = document.getElementById('cal-trainee-lists');
      if (listHost) listHost.innerHTML = calTraineeListsHtml(activeTrainee);
    }, 150));
  }

  panel.addEventListener('click', (e) => {
    const sortBtn = e.target.closest('.sort-btn');
    if (sortBtn) {
      calTraineeSort = sortBtn.dataset.sort;
      panel.querySelectorAll('.sort-btn').forEach(b => {
        const on = b.dataset.sort === calTraineeSort;
        b.classList.toggle('active', on);
        b.setAttribute('aria-pressed', on ? 'true' : 'false');
      });
      const listHost = document.getElementById('cal-trainee-lists');
      if (listHost) {
        listHost.innerHTML = calTraineeListsHtml(activeTrainee);
        listHost.scrollTop = 0;
      }
      return;
    }

    const removeBtn = e.target.closest('[data-remove]');
    if (removeBtn) {
      e.stopPropagation();
      removeFromMyList(removeBtn.dataset.remove);
      renderCalendarView();
      return;
    }

    const addBtn = e.target.closest('[data-addswitch]');
    if (addBtn) {
      e.stopPropagation();
      const d = DATABASE.find(x => x.name === addBtn.dataset.addswitch);
      if (!d) return;
      // N2: resolve the trainee by canonical key so a name that normalises
      // to an existing entry doesn't select the wrong card.
      const wantedKey = traineeNameKey(d.name);
      addToMyList(d.name, JSON.parse(JSON.stringify(d.apt)), { announce: false });
      const added = state.myList.find(t => traineeNameKey(t.name) === wantedKey);
      if (added) state.settings.activeTraineeId = added.id;
      calTraineePanelOpen = false;
      calTraineePanelRevealed = false;
      calTraineePanelJustOpened = false;
      saveState();
      renderCalendarView();
      return;
    }

    const switchRow = e.target.closest('[data-switch]');
    if (switchRow) {
      state.settings.activeTraineeId = switchRow.dataset.switch;
      calTraineePanelOpen = false;
      calTraineePanelRevealed = false;
      calTraineePanelJustOpened = false;
      saveState();
      withFocusKept(() => renderCalendarView());
    }
  });
}

export function closeCalTraineePanel() {
  if (!calTraineePanelOpen) return false;
  calTraineePanelOpen = false;
  calTraineePanelRevealed = false;
  calTraineePanelJustOpened = false;
  const arrow = document.querySelector('#cal-trainee-btn .cal-trainee-arrow');
  const panel = document.getElementById('cal-trainee-panel');
  const btn = document.getElementById('cal-trainee-btn');
  if (arrow) arrow.classList.remove('open');
  if (panel) panel.classList.remove('open');
  if (btn) btn.setAttribute('aria-expanded', 'false');
  setTimeout(renderCalendarView, 250);
  return true;
}

export function renderCalendarView() {
  withFocusKept(() => {
  const host = document.getElementById('calendar-view');
  if (!host) return;

  const isEmpty = state.myList.length === 0;
  let activeTrainee;
  if (isEmpty) {
    activeTrainee = CAL_EMPTY_TRAINEE;
  } else {
    activeTrainee = state.myList.find(t => t.id === state.settings.activeTraineeId);
    if (!activeTrainee) {
      // N3: fall back without persisting — render stays pure.
      // Storage-level healing happens in removeFromMyList / importListFromText.
      activeTrainee = state.myList[0];
    }
  }

  if (calViewTab === "OoB" && !state.settings.allowCustomTrophies) calViewTab = "Junior";
  const mainTabs = [...CAL_YEAR_GROUPS, ...(state.settings.allowCustomTrophies ? ["OoB"] : [])];

  host.innerHTML = `
    <div class="calendar-layout">
      ${calSidebarHtml(activeTrainee, isEmpty)}
      <div class="cal-main${isEmpty ? ' cal-disabled' : ''}">
        <div class="cal-tabs cal-tabs-main" id="cal-main-tabs" role="tablist" aria-label="Year group">
          ${mainTabs.map(tab => `<button class="cal-tab-btn ${calViewTab === tab ? 'active' : ''}" id="caltab-main-${tab}" data-tab="${tab}" role="tab" aria-selected="${calViewTab === tab ? 'true' : 'false'}" aria-controls="cal-main-page">${tab === "OoB" ? "Out-of-Bond" : tab}</button>`).join("")}
        </div>
        <div class="cal-page" id="cal-main-page" role="tabpanel" aria-labelledby="caltab-main-${calViewTab}">${calPageHtml(activeTrainee, calViewTab)}</div>
      </div>
    </div>`;

  wireChips(host);
  wireCalTraineePanel(host, activeTrainee);
  wireCalLocate(host, activeTrainee);

  const mainTabsEl = document.getElementById('cal-main-tabs');
  if (mainTabsEl) {
    wireTabArrowNav(mainTabsEl);
    mainTabsEl.querySelectorAll('.cal-tab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const v = btn.dataset.tab;
        if (![...CAL_YEAR_GROUPS, 'OoB'].includes(v)) return;
        calViewTab = v;
        withFocusKept(() => renderCalendarView());
        document.getElementById(`caltab-main-${v}`)?.focus({ preventScroll: true });
      });
    });
  }

  wireCalPage(document.getElementById('cal-main-page'), activeTrainee, () => withFocusKept(() => renderCalendarView()));

  const toolsToggle = document.getElementById('cal-tools-toggle');
  if (toolsToggle) toolsToggle.addEventListener('click', () => {
    const list = document.getElementById('cal-tools-body');
    const arrow = toolsToggle.querySelector('.cal-trainee-arrow');
    if (moreToolsOpen) {
      moreToolsOpen = false;
      moreToolsRevealed = false;
      if (list) list.classList.remove('open');
      if (arrow) arrow.classList.remove('open');
      toolsToggle.setAttribute('aria-expanded', 'false');
      setTimeout(renderCalendarView, 300);
    } else {
      moreToolsOpen = true;
      renderCalendarView();
      const freshList = document.getElementById('cal-tools-body');
      const freshArrow = document.querySelector('#cal-tools-toggle .cal-trainee-arrow');
      const freshToggle = document.getElementById('cal-tools-toggle');
      if (freshList) freshList.getBoundingClientRect();
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          if (freshList) freshList.classList.add('open');
          if (freshArrow) freshArrow.classList.add('open');
          if (freshToggle) freshToggle.setAttribute('aria-expanded', 'true');
          moreToolsRevealed = true;
        });
      });
    }
  });

  const calBackupBtn = document.getElementById('cal-backup-btn');
  if (calBackupBtn) calBackupBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    closeCalTraineePanel();
    openBackupModal();
  });
  const calAboutBtn = document.getElementById('cal-about-btn');
  if (calAboutBtn) calAboutBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    closeCalTraineePanel();
    openAboutModal();
  });
  const calModeToggleBtn = document.getElementById('cal-mode-toggle-btn');
  if (calModeToggleBtn) calModeToggleBtn.addEventListener('click', toggleMode);
  const calThemeToggleBtn = document.getElementById('cal-theme-toggle-btn');
  if (calThemeToggleBtn) calThemeToggleBtn.addEventListener('click', toggleColorTheme);
  const calTrainToggle = document.getElementById('cal-toggle-custom-trainee');
  if (calTrainToggle) calTrainToggle.addEventListener('change', () => setAllowCustomTrainees(calTrainToggle.checked));
  const calTrophyToggle = document.getElementById('cal-toggle-custom-trophy');
  if (calTrophyToggle) calTrophyToggle.addEventListener('change', () => setAllowCustomTrophies(calTrophyToggle.checked));

  const exitBtn = document.getElementById('cal-exit-btn');
  if (exitBtn) exitBtn.addEventListener('click', () => {
    setCalendarViewMode(false);
  });
  });
}