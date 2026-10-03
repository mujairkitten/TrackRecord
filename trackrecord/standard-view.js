import { DATABASE } from './data/database.js';
import { RACES, TRACK_TO_APT_KEY, DIST_TO_APT_KEY } from './data/races.js';
import {
  state, escapeHtml, escapeAttr, gradeOf, GRADE_INFO,
  aptGroupsHtml, wireChips, wireTabArrowNav, tagFgForVar, iconHtml, weakAptitudes, sortRowsByMode, raceDateLabel, debounce,
  withFocusKept, setTrophyChecked, showToast,
  traineeNameKey, findRaceByExactName, raceMeta,
  addToMyList, removeFromMyList, addTrophy, removeTrophy, addTrophyFromInput
} from './core.js';
import { calPageHtml, wireCalPage, calGradeColor, calGradeFg, CAL_YEAR_GROUPS } from './calendar.js';
import { openBackupModal } from './settings.js';

let dbSort = "default";
const DB_PAGE_SIZE = 30;
let dbPage = 1;
const MY_PAGE_SIZE = 5;
let myPage = 1;

const openInlineCals = new Set();
const inlineCalTab = {};

const dbGridWired = new WeakSet();
function wireDbGridActions(grid) {
  if (dbGridWired.has(grid)) return;
  dbGridWired.add(grid);
  grid.addEventListener('click', (e) => {
    const clearBtn = e.target.closest('[data-clear-search]');
    if (clearBtn) {
      const search = document.getElementById('db-search');
      if (search) search.value = '';
      dbPage = 1;
      renderDatabase();
      document.getElementById('db-search')?.focus();
      return;
    }
    const btn = e.target.closest('[data-add]');
    if (!btn || btn.disabled) return;
    const idx = Number(btn.dataset.add);
    if (!Number.isInteger(idx) || idx < 0 || idx >= DATABASE.length) return;
    const d = DATABASE[idx];
    addToMyList(d.name, JSON.parse(JSON.stringify(d.apt)));
  });
}

export function renderDatabase() {
  withFocusKept(() => {
  const grid = document.getElementById('db-grid');
  if (!grid) return;
  const filter = document.getElementById('db-search').value.trim().toLowerCase();
  const list = sortRowsByMode(DATABASE.filter(d => d.name.toLowerCase().includes(filter)), dbSort);
  document.getElementById('db-count').textContent = `${list.length}/${DATABASE.length}`;

  const totalPages = Math.max(1, Math.ceil(list.length / DB_PAGE_SIZE));
  if (dbPage > totalPages) dbPage = totalPages;
  if (dbPage < 1) dbPage = 1;
  const pageList = list.slice((dbPage - 1) * DB_PAGE_SIZE, dbPage * DB_PAGE_SIZE);

  const addedNames = new Set(state.myList.map(t => traineeNameKey(t.name)));
  const indexByName = new Map(DATABASE.map((d, i) => [d.name, i]));

  if (pageList.length === 0) {
    grid.innerHTML = `<div class="empty-note">No trainees match “${escapeHtml(document.getElementById('db-search').value.trim())}”. <button class="btn small" data-clear-search>Clear search</button></div>`;
  } else {
  grid.innerHTML = pageList.map((d) => {
    const realIndex = indexByName.get(d.name);
    const already = addedNames.has(traineeNameKey(d.name));
    return `
    <div class="db-card">
      ${filter ? '' : `<span class="db-num">${String(realIndex + 1).padStart(2, '0')}</span>`}
      <div class="db-card-top${filter ? ' no-num' : ''}">
        ${iconHtml(d.name, 40)}
        <div class="db-name">${escapeHtml(d.name)}</div>
      </div>
      ${aptGroupsHtml(d.apt)}
      <button class="btn small add-btn" data-add="${realIndex}" aria-label="Add ${escapeAttr(d.name)} to my list" ${already ? 'disabled' : ''}>${already ? '✓ In my list' : '+ Add to my list'}</button>
    </div>`;
  }).join("");
  }

  wireChips(grid);
  wireDbGridActions(grid);
  renderPagination('db-pagination-top', 'db-pagination-bottom', dbPage, totalPages, 'Trainee database', (nextPage) => {
    dbPage = nextPage;
    renderDatabase();
    scrollPagerIntoView('db-pagination-top');
  });
  });
}

function reducedMotion() {
  return typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function scrollPagerIntoView(topId) {
  const el = document.getElementById(topId);
  if (el) el.scrollIntoView({ block: 'nearest', behavior: reducedMotion() ? 'auto' : 'smooth' });
}

function pageWindow(current, total) {
  const pages = new Set([1, total, current, current - 1, current + 1, current - 2, current + 2]);
  const list = [...pages].filter(p => p >= 1 && p <= total).sort((a, b) => a - b);
  const out = [];
  let prev = 0;
  for (const p of list) {
    if (prev && p - prev > 1) out.push('…');
    out.push(p);
    prev = p;
  }
  return out;
}

function renderPagination(topId, bottomId, page, totalPages, pagerName, onGoToPage) {
  if (typeof pagerName === 'function') {
    onGoToPage = pagerName;
    pagerName = 'Pages';
  }
  [topId, bottomId].forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    if (!el.dataset.pagerWired) {
      el.dataset.pagerWired = 'true';
      el.addEventListener('click', (e) => {
        const btn = e.target.closest('[data-page-action], [data-page]');
        if (!btn || btn.disabled) return;
        const go = el._goToPage;
        if (typeof go !== 'function') return;
        const cur = el._page;
        const next = btn.dataset.page !== undefined && btn.dataset.page !== ''
          ? Number(btn.dataset.page)
          : cur + (btn.dataset.pageAction === 'next' ? 1 : -1);
        go(next);
      });
    }
    el._goToPage = onGoToPage;
    el._page = page;
    if (totalPages <= 1) { el.innerHTML = ""; return; }
    const pageButtons = pageWindow(page, totalPages).map(item => {
      if (item === '…') return `<span class="db-page-ellipsis" aria-hidden="true">…</span>`;
      const isCurrent = item === page;
      return `<button class="btn small page-number${isCurrent ? ' active' : ''}" data-page="${item}" aria-label="Go to page ${item} of ${pagerName}" ${isCurrent ? 'aria-current="page"' : ''}>${item}</button>`;
    }).join('');
    el.innerHTML = `
      <button class="btn small page-arrow" data-page-action="prev" aria-label="Previous page of ${pagerName}" ${page <= 1 ? 'disabled' : ''}>‹</button>
      <span class="db-page-numbers">${pageButtons}</span>
      <button class="btn small page-arrow" data-page-action="next" aria-label="Next page of ${pagerName}" ${page >= totalPages ? 'disabled' : ''}>›</button>
    `;
  });
}

export function renderMyList() {
  withFocusKept(() => {
  const wrap = document.getElementById('mylist');
  if (!wrap) return;
  const emptyEl = document.getElementById('mylist-empty');
  document.getElementById('my-count').textContent = `${state.myList.length}`;

  const liveIds = new Set(state.myList.map(t => t.id));
  for (const id of [...openInlineCals]) if (!liveIds.has(id)) openInlineCals.delete(id);
  for (const id of Object.keys(inlineCalTab)) if (!liveIds.has(id)) delete inlineCalTab[id];

  if (state.myList.length === 0) {
    emptyEl.style.display = "block";
    emptyEl.innerHTML = state.settings.allowCustomTrainees
      ? `Your list is empty — add trainees from the database above, or add a custom one. <button class="btn small" id="empty-import-btn">Import backup</button>`
      : `Your list is empty — add trainees from the database above. <button class="btn small" id="empty-import-btn">Import backup</button>`;
    const importBtn = document.getElementById('empty-import-btn');
    if (importBtn) importBtn.addEventListener('click', openBackupModal);
    wrap.innerHTML = "";
    renderPagination('my-pagination-top', 'my-pagination-bottom', 1, 1, 'My List', () => {});
    return;
  }
  emptyEl.style.display = "none";

  const totalPages = Math.max(1, Math.ceil(state.myList.length / MY_PAGE_SIZE));
  if (myPage > totalPages) myPage = totalPages;
  if (myPage < 1) myPage = 1;
  const pageList = state.myList.slice((myPage - 1) * MY_PAGE_SIZE, myPage * MY_PAGE_SIZE);

  wrap.innerHTML = pageList.map(t => myCardHtml(t)).join("");
  wireChips(wrap);

  pageList.forEach(t => {
    const delBtn = document.getElementById(`del-${t.id}`);
    if (delBtn) delBtn.addEventListener('click', () => removeFromMyList(t.id));

    const addTBtn = document.getElementById(`addt-btn-${t.id}`);
    const addTInput = document.getElementById(`addt-input-${t.id}`);
    const suggestBox = document.getElementById(`addt-suggest-${t.id}`);

    if (addTBtn) addTBtn.addEventListener('click', () => {
      if (addTrophyFromInput(t.id, addTInput.value)) addTInput.value = "";
      hideSuggestBox(suggestBox);
    });
    if (addTInput) {
      addTInput.addEventListener('keydown', e => {
        if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
          const items = suggestBox ? [...suggestBox.querySelectorAll('.race-suggest-item')] : [];
          if (items.length === 0) return;
          e.preventDefault();
          const active = suggestBox.querySelector('.race-suggest-item.active');
          let idx = items.indexOf(active);
          idx = e.key === 'ArrowDown'
            ? (idx + 1) % items.length
            : (idx - 1 + items.length) % items.length;
          setActiveSuggestItem(suggestBox, addTInput, items[idx]);
          items[idx].scrollIntoView({ block: 'nearest' });
          return;
        }
        if (e.key === 'Enter') {
          const active = suggestBox ? suggestBox.querySelector('.race-suggest-item.active') : null;
          const raw = active ? active.dataset.race : addTInput.value;
          if (addTrophyFromInput(t.id, raw)) addTInput.value = "";
          hideSuggestBox(suggestBox);
          addTInput.setAttribute('aria-expanded', 'false');
        } else if (e.key === 'Escape') {
          hideSuggestBox(suggestBox);
          addTInput.setAttribute('aria-expanded', 'false');
        }
      });
      const debouncedSuggest = debounce(() => {
        renderRaceSuggestions(t, addTInput.value, suggestBox, addTInput);
      }, 120);
      addTInput.addEventListener('input', debouncedSuggest);
      addTInput.addEventListener('focus', () => {
        renderRaceSuggestions(t, addTInput.value, suggestBox, addTInput);
      });
      addTInput.addEventListener('blur', () => {
        setTimeout(() => hideSuggestBox(suggestBox), 150);
      });
    }

    t.trophies.forEach(tr => {
      const cb = document.getElementById(`cb-${t.id}-${tr.id}`);
      if (cb) cb.addEventListener('change', () => {
        const res = setTrophyChecked(t.id, tr.id, cb.checked);
        if (!res) { renderMyList(); return; }
        const row = cb.closest('.trophy-item');
        if (row) row.classList.toggle('checked', cb.checked);
        updateCardProgress(t.id);
      });
      const rm = document.getElementById(`rm-${t.id}-${tr.id}`);
      if (rm) rm.addEventListener('click', () => removeTrophy(t.id, tr.id));
    });

    const calBtn = document.getElementById(`calbtn-${t.id}`);
    if (calBtn) calBtn.addEventListener('click', () => {
      const willOpen = !openInlineCals.has(t.id);
      if (willOpen) openInlineCals.add(t.id); else openInlineCals.delete(t.id);
      const calBody = document.getElementById(`calbody-${t.id}`);
      const calChev = calBtn.querySelector('.cal-trainee-arrow');
      if (calBody) calBody.classList.toggle('open', willOpen);
      if (calChev) calChev.classList.toggle('open', willOpen);
      calBtn.setAttribute('aria-expanded', willOpen ? 'true' : 'false');
    });
    const tabsBox = document.getElementById(`caltabs-${t.id}`);
    if (tabsBox) {
      wireTabArrowNav(tabsBox);
      tabsBox.querySelectorAll('.cal-tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          const v = btn.dataset.tab;
          if (![...CAL_YEAR_GROUPS, 'OoB'].includes(v)) return;
          inlineCalTab[t.id] = v;
          tabsBox.querySelectorAll('.cal-tab-btn').forEach(b => {
            const on = b === btn;
            b.classList.toggle('active', on);
            b.setAttribute('aria-selected', on ? 'true' : 'false');
          });
          const page = document.getElementById(`calpage-${t.id}`);
          if (page) {
            page.innerHTML = calPageHtml(t, v, { showAdd: true });
            page.setAttribute('aria-labelledby', `caltab-${t.id}-${v}`);
            wireCalPage(page, t, renderMyList);
          }
        });
      });
    }
    const pageBox = document.getElementById(`calpage-${t.id}`);
    if (pageBox) wireCalPage(pageBox, t, renderMyList);
  });

  renderPagination('my-pagination-top', 'my-pagination-bottom', myPage, totalPages, 'My List', (nextPage) => {
    myPage = nextPage;
    renderMyList();
    scrollPagerIntoView('my-pagination-top');
  });
  });
}

function goToTrainee(id) {
  const idx = state.myList.findIndex(t => t.id === id);
  if (idx === -1) return;
  myPage = Math.floor(idx / MY_PAGE_SIZE) + 1;
  renderMyList();
  requestAnimationFrame(() => {
    document.getElementById(`card-${id}`)?.scrollIntoView({ block: 'nearest', behavior: reducedMotion() ? 'auto' : 'smooth' });
  });
}

function updateCardProgress(tid) {
  const card = document.getElementById(`card-${tid}`);
  const t = state.myList.find(x => x.id === tid);
  if (!card || !t) return;
  const total = t.trophies.length;
  const done = t.trophies.filter(x => x.checked).length;
  const pct = total ? Math.round((done / total) * 100) : 0;
  const fill = card.querySelector('.progress-fill');
  const label = card.querySelector('.progress-pct');
  const track = card.querySelector('.progress-track');
  if (fill) fill.style.width = pct + '%';
  if (label) label.textContent = `${done}/${total} · ${pct}%`;
  if (track) track.setAttribute('aria-valuenow', String(pct));
}

function syncCardTrophy(tid, raceName, checked) {
  const t = state.myList.find(x => x.id === tid);
  const tr = t ? t.trophies.find(x => traineeNameKey(x.name) === traineeNameKey(raceName)) : null;
  if (!t || !tr) return;
  const cb = document.getElementById(`cb-${tid}-${tr.id}`);
  if (cb && cb.checked !== checked) cb.checked = checked;
  const row = cb ? cb.closest('.trophy-item') : null;
  if (row) row.classList.toggle('checked', checked);
  updateCardProgress(tid);
}

function setActiveSuggestItem(box, input, item) {
  if (!box) return;
  box.querySelectorAll('.race-suggest-item.active').forEach(el => {
    el.classList.remove('active');
    el.setAttribute('aria-selected', 'false');
  });
  if (item) {
    item.classList.add('active');
    item.setAttribute('aria-selected', 'true');
    if (input && item.id) input.setAttribute('aria-activedescendant', item.id);
  } else if (input) {
    input.removeAttribute('aria-activedescendant');
  }
}

function hideSuggestBox(box) {
  if (!box) return;
  box.classList.remove('show');
  const addWrap = box.closest('.add-trophy');
  const input = addWrap ? addWrap.querySelector('input') : null;
  if (input) {
    input.setAttribute('aria-expanded', 'false');
    input.removeAttribute('aria-activedescendant');
  }
  const card = box.closest('.mycard');
  if (card) card.classList.remove('suggest-open');
}

function renderRaceSuggestions(trainee, query, box, inputEl) {
  if (!box) return;
  const q = (query || "").trim().toLowerCase();
  const alreadyAdded = new Set(trainee.trophies.map(tr => traineeNameKey(tr.name)));

  let matches = RACES.filter(r => !alreadyAdded.has(traineeNameKey(r.name)));
  if (q) matches = matches.filter(r => r.name.toLowerCase().includes(q));

  const customAllowed = state.settings.allowCustomTrophies;
  const SUGGEST_CAP = 20;
  if (matches.length === 0) {
    box.innerHTML = `<div class="race-suggest-empty">${q ? (customAllowed ? "No matching race — Enter adds it as a custom trophy." : "No matching race. Custom trophies are disabled in settings.") : "Type to search the race calendar."}</div>`;
  } else {
    const shown = matches.slice(0, SUGGEST_CAP);
    box.innerHTML = shown.map((r, i) => {
      const trackKey = TRACK_TO_APT_KEY[r.track];
      const distKey = DIST_TO_APT_KEY[r.distance];
      const trackGrade = gradeOf(trainee.aptitudes[trackKey]);
      const distGrade = gradeOf(trainee.aptitudes[distKey]);
      const trackTier = GRADE_INFO[trackGrade].tier;
      const distTier = GRADE_INFO[distGrade].tier;
      return `
      <div class="race-suggest-item" id="${box.id}-opt-${i}" role="option" tabindex="-1" aria-selected="false" data-race="${escapeAttr(r.name)}">
        <span class="race-grade-tag" style="background:${calGradeColor(r.grade)};color:${calGradeFg(r.grade)}">${r.grade}</span>
        <span class="race-info">
          <span class="race-name">${escapeHtml(r.name)}</span>
          <span class="race-date">${escapeHtml(raceDateLabel(r))}</span>
        </span>
        <span class="race-meta">
          <span class="mini-tag" style="background:var(--${trackTier});color:${tagFgForVar(trackTier)}">${escapeHtml(r.track)} ${escapeHtml(trackGrade)}</span>
          <span class="mini-tag" style="background:var(--${distTier});color:${tagFgForVar(distTier)}">${escapeHtml(r.distance)} ${escapeHtml(distGrade)}</span>
        </span>
      </div>`;
    }).join("") + (matches.length > SUGGEST_CAP ? `<div class="race-suggest-empty">Showing ${SUGGEST_CAP} of ${matches.length} — keep typing to narrow.</div>` : "");
  }
  box.classList.add('show');
  if (inputEl) inputEl.setAttribute('aria-expanded', 'true');
  const openCard = box.closest('.mycard');
  if (openCard) openCard.classList.add('suggest-open');
}

function myCardHtml(t) {
  const weak = weakAptitudes(t.aptitudes);
  const focusHtml = weak.length
    ? `<div class="focus-line"><b>Needs sparks:</b> ${weak.map(w => `${w.label} (${w.grade})`).join(", ")}</div>`
    : `<div class="focus-line clear"><b>Aptitudes clear</b> — nothing below C.</div>`;

  const total = t.trophies.length;
  const done = t.trophies.filter(x => x.checked).length;
  const pct = total ? Math.round((done / total) * 100) : 0;

  const trophyHtml = total
    ? t.trophies.map(tr => {
      let metaHtml = "";
      if (tr.track && tr.distance) {
        const trackKey = TRACK_TO_APT_KEY[tr.track];
        const distKey = DIST_TO_APT_KEY[tr.distance];
        const trackGrade = gradeOf(t.aptitudes[trackKey]);
        const distGrade = gradeOf(t.aptitudes[distKey]);
        const trackTier = GRADE_INFO[trackGrade].tier;
        const distTier = GRADE_INFO[distGrade].tier;
        const dateHtml = tr.year ? `<span class="trophy-date">${escapeHtml(raceDateLabel(tr))}</span>` : "";
        metaHtml = `
          ${dateHtml}
          <span class="mini-tag" style="background:${calGradeColor(tr.grade)};color:${calGradeFg(tr.grade)}">${escapeHtml(tr.grade || "")}</span>
          <span class="mini-tag" style="background:var(--${trackTier});color:${tagFgForVar(trackTier)}" title="${escapeAttr(tr.track)} aptitude: ${escapeAttr(trackGrade)}">${escapeHtml(tr.track)} ${escapeHtml(trackGrade)}</span>
          <span class="mini-tag" style="background:var(--${distTier});color:${tagFgForVar(distTier)}" title="${escapeAttr(tr.distance)} aptitude: ${escapeAttr(distGrade)}">${escapeHtml(tr.distance)} ${escapeHtml(distGrade)}</span>
        `;
      }
      return `
      <div class="trophy-item ${tr.checked ? 'checked' : ''}">
        <input type="checkbox" id="cb-${t.id}-${tr.id}" aria-label="${escapeAttr(tr.name)}" ${tr.checked ? 'checked' : ''}>
        <span>${escapeHtml(tr.name)}</span>
        ${metaHtml}
        <button class="rm" id="rm-${t.id}-${tr.id}" aria-label="Remove ${escapeAttr(tr.name)}">&times;</button>
      </div>`;
    }).join("")
    : `<div style="font-size:12px;color:var(--ink-faint);font-style:italic;">No races logged yet.</div>`;

  const oobAllowed = !!state.settings.allowCustomTrophies;
  const inlineTabs = [...CAL_YEAR_GROUPS, ...(oobAllowed ? ["OoB"] : [])];
  let inlineActiveTab = inlineCalTab[t.id] || "Junior";
  if (inlineActiveTab === "OoB" && !oobAllowed) inlineActiveTab = "Junior";

  const inlineCalHtml = `
    <div class="inline-cal">
      <button class="inline-cal-toggle" id="calbtn-${t.id}" aria-expanded="${openInlineCals.has(t.id) ? 'true' : 'false'}" aria-controls="calbody-${t.id}">
        <svg class="text-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true" xmlns="http://www.w3.org/2000/svg">
          <rect x="3" y="5" width="18" height="16" rx="2" stroke="currentColor" stroke-width="2"/>
          <path d="M3 10H21M8 3V7M16 3V7" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
        </svg> Calendar
        <span class="cal-trainee-arrow${openInlineCals.has(t.id) ? ' open' : ''}">
          <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M6 9l6 6 6-6" stroke="currentColor" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        </span>
      </button>
      <div class="inline-cal-body ${openInlineCals.has(t.id) ? 'open' : ''}" id="calbody-${t.id}">
        <div class="cal-tabs" id="caltabs-${t.id}" role="tablist" aria-label="Year group">
          ${inlineTabs.map(tab => `<button class="cal-tab-btn ${inlineActiveTab === tab ? 'active' : ''}" id="caltab-${t.id}-${tab}" data-tab="${tab}" role="tab" aria-selected="${inlineActiveTab === tab ? 'true' : 'false'}" aria-controls="calpage-${t.id}">${tab === "OoB" ? "Out-of-Bond" : tab}</button>`).join("")}
        </div>
        <div class="cal-page" id="calpage-${t.id}" role="tabpanel" aria-labelledby="caltab-${t.id}-${inlineActiveTab}">${calPageHtml(t, inlineActiveTab, { showAdd: true })}</div>
      </div>
    </div>`;

  return `
  <div class="mycard" id="card-${t.id}" data-tid="${t.id}">
    <div class="mycard-head">
      ${iconHtml(t.name, 48)}
      <h3 class="mycard-name">${escapeHtml(t.name)}</h3>
      <button class="btn small ghost" id="del-${t.id}" aria-label="Remove ${escapeAttr(t.name)} from My List">Remove</button>
    </div>
    <div class="cats-row">${aptGroupsHtml(t.aptitudes)}</div>
    ${focusHtml}
    <div class="trophy-section">
      <div class="trophy-top">
        <span class="label">Completionist</span>
        <div class="progress-track" role="progressbar" aria-label="Completionist progress for ${escapeAttr(t.name)}" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${pct}"><div class="progress-fill" style="width:${pct}%"></div></div>
        <span class="progress-pct">${done}/${total} · ${pct}%</span>
      </div>
      <div class="trophy-list">${trophyHtml}</div>
      <div class="add-trophy">
        <input type="text" id="addt-input-${t.id}" placeholder="Search races…" autocomplete="off" aria-label="Search races to add for ${escapeAttr(t.name)}" role="combobox" aria-expanded="false" aria-controls="addt-suggest-${t.id}" aria-autocomplete="list" aria-haspopup="listbox">
        <button class="btn small" id="addt-btn-${t.id}" aria-label="Add trophy for ${escapeAttr(t.name)}">+ Add</button>
        <div class="race-suggest" id="addt-suggest-${t.id}" role="listbox" aria-label="Matching races"></div>
      </div>
    </div>
    ${inlineCalHtml}
  </div>`;
}

function addCustom() {
  if (!state.settings.allowCustomTrainees) return;
  const input = document.getElementById('custom-name');
  const name = input.value.trim();
  if (!name) { input.focus(); return; }
  if (addToMyList(name, { turf: "A", dirt: "A", sprint: "A", mile: "A", medium: "A", long: "A" })) {
    input.value = "";
  } else {
    input.focus();
    input.select();
  }
}

function wireBlockCollapse(toggleBtn, body) {
  if (!toggleBtn || !body) return;

  body.classList.add('open', 'overflow-visible');
  body.style.maxHeight = 'none';

  const baseLabel = toggleBtn.getAttribute('aria-label') || 'Toggle section';
  const setExpanded = (open) => {
    toggleBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
    toggleBtn.setAttribute('aria-label', open
      ? baseLabel.replace(/^Expand/i, 'Collapse')
      : baseLabel.replace(/^Collapse/i, 'Expand'));
    const arrow = toggleBtn.querySelector('.cal-trainee-arrow');
    if (arrow) arrow.classList.toggle('open', open);
  };
  setExpanded(true);

  toggleBtn.addEventListener('click', () => {
    const willOpen = !body.classList.contains('open');
    body.classList.remove('overflow-visible');

    if (willOpen) {
      body.style.maxHeight = '0px';
      void body.offsetHeight;
      body.classList.add('open');
      body.style.maxHeight = body.scrollHeight + 'px';
    } else {
      body.style.maxHeight = body.scrollHeight + 'px';
      void body.offsetHeight;
      body.classList.remove('open');
      body.style.maxHeight = '0px';
    }
    body.inert = !willOpen;
    if (!willOpen && body.contains(document.activeElement)) toggleBtn.focus();
    setExpanded(willOpen);
  });

  body.addEventListener('transitionend', (e) => {
    if (e.propertyName !== 'max-height') return;
    if (body.classList.contains('open')) {
      body.style.maxHeight = 'none';
      body.classList.add('overflow-visible');
    }
  });
}

export function wireStandardViewControls() {
  document.getElementById('db-search').addEventListener('input', debounce(() => {
    dbPage = 1;
    renderDatabase();
  }, 120));
  document.getElementById('custom-add-btn').addEventListener('click', addCustom);
  document.getElementById('custom-name').addEventListener('keydown', e => { if (e.key === 'Enter') addCustom(); });

  document.querySelectorAll('#db-sort .sort-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      dbSort = btn.dataset.sort;
      dbPage = 1;
      document.querySelectorAll('#db-sort .sort-btn').forEach(b => {
        const on = b === btn;
        b.classList.toggle('active', on);
        b.setAttribute('aria-pressed', on ? 'true' : 'false');
      });
      renderDatabase();
    });
  });

  const wrap = document.getElementById('mylist');
  if (wrap && !wrap.dataset.suggestWired) {
    wrap.dataset.suggestWired = 'true';
    let lastPick = { race: '', at: 0 };
    const pickSuggestItem = (e) => {
      const item = e.target && e.target.closest ? e.target.closest('.race-suggest-item') : null;
      if (!item || !wrap.contains(item)) return;
      if (e.type === 'mousedown') e.preventDefault();
      // mousedown is followed by click — handle once.
      const now = Date.now();
      if (e.type === 'click' && item.dataset.race === lastPick.race && now - lastPick.at < 500) return;
      lastPick = { race: item.dataset.race, at: now };
      const addWrap = item.closest('.add-trophy');
      const input = addWrap ? addWrap.querySelector('input') : null;
      const tid = input ? input.id.replace('addt-input-', '') : '';
      if (!tid || !input) return;
      const race = findRaceByExactName(item.dataset.race);
      if (race && addTrophy(tid, race.name, raceMeta(race))) {
        input.value = "";
        const host = state.myList.find(x => x.id === tid);
        const added = host ? host.trophies.find(tr => traineeNameKey(tr.name) === traineeNameKey(race.name)) : null;
        if (added) showToast(`Added ${race.name} to ${host.name}'s list.`, {
          actionLabel: 'Undo',
          duration: 8000,
          onAction: () => removeTrophy(tid, added.id)
        });
      }
      hideSuggestBox(item.closest('.race-suggest'));
    };
    wrap.addEventListener('mousedown', pickSuggestItem);
    wrap.addEventListener('click', pickSuggestItem);
    wrap.addEventListener('mouseover', (e) => {
      const item = e.target && e.target.closest ? e.target.closest('.race-suggest-item') : null;
      if (!item || !wrap.contains(item)) return;
      const box = item.closest('.race-suggest');
      const input = box ? box.closest('.add-trophy')?.querySelector('input') : null;
      setActiveSuggestItem(box, input, item);
    });
  }

  if (!window._cbViewTraineeWired) {
    window._cbViewTraineeWired = true;
    window.addEventListener('cb-view-trainee', (e) => {
      if (e && e.detail && e.detail.id) goToTrainee(e.detail.id);
    });
    window.addEventListener('cb-card-progress', (e) => {
      const d = e && e.detail;
      if (!d || !d.id) return;
      syncCardTrophy(d.id, d.race, d.checked);
    });
    // Membership changes patch the DB button + counts without rebuilding the grid.
    window.addEventListener('cb-db-button', (e) => {
      const d = e && e.detail;
      if (!d || !d.name) return;
      const key = traineeNameKey(d.name);
      document.getElementById('my-count').textContent = `${state.myList.length}`;
      const grid = document.getElementById('db-grid');
      if (!grid) return;
      grid.querySelectorAll('[data-add]').forEach(btn => {
        const idx = Number(btn.dataset.add);
        if (!Number.isInteger(idx) || idx < 0 || idx >= DATABASE.length) return;
        if (traineeNameKey(DATABASE[idx].name) !== key) return;
        btn.disabled = !!d.inList;
        btn.textContent = d.inList ? '✓ In my list' : '+ Add to my list';
      });
    });
  }

  wireBlockCollapse(document.getElementById('db-collapse-btn'), document.getElementById('db-block-body'));
  wireBlockCollapse(document.getElementById('my-collapse-btn'), document.getElementById('my-block-body'));
}