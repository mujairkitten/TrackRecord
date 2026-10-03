import { RACES } from '../data/races.js';
import { DATABASE } from '../data/database.js';
import { renderMyList } from './render-bus.js';

const GRADES = ["A", "B", "C", "D", "E", "F", "G"];
export const GRADE_INFO = {
  A: { tier: "a" },
  B: { tier: "b" },
  C: { tier: "c" },
  D: { tier: "d" },
  E: { tier: "e" },
  F: { tier: "f" },
  G: { tier: "g" },
};
const GRADE_TIP_SURFACE = {
  A: { pct: "100%", tip: "Baseline acceleration. No penalty, safe to race here." },
  B: { pct: "-10%", tip: "≈-0.03 to -0.05 m/s² acceleration. One matching spark usually bumps this to A." },
  C: { pct: "-20%", tip: "≈-0.07 to -0.09 m/s² acceleration. Worth 4-6 sparks before racing seriously." },
  D: { pct: "-30%", tip: "≈-0.10 to -0.14 m/s² acceleration. Push through only if the trophy is required. Needs 7-9 sparks." },
  E: { pct: "-50%", tip: "≈-0.16 to -0.23 m/s² acceleration — severe. Avoid unless mandatory. Needs atleast 10 sparks." },
  F: { pct: "-70%", tip: "≈-0.23 to -0.33 m/s² acceleration — near-crippling. Even max sparks (12) only gives you to C." },
  G: { pct: "-90%", tip: "≈-0.30 to -0.42 m/s² acceleration — worst case. Only for a must-have trophy. Even max sparks (12) only gives you to C." },
};
const GRADE_TIP_DISTANCE = {
  A: { pct: "100%", tip: "Baseline. No penalty to late-race speed or acceleration." },
  B: { pct: "-10%", tip: "≈-0.11 to -0.15 m/s late-race speed. Acceleration still unaffected. One matching spark usually bumps this to A." },
  C: { pct: "-20%", tip: "≈-0.22 to -0.31 m/s late-race speed. Acceleration still unaffected. Worth 4-6 sparks before racing seriously." },
  D: { pct: "-40%", tip: "≈-0.44 to -0.62 m/s late-race speed. Acceleration still holds. Push through only if the trophy is required. Needs 7-9 sparks." },
  E: { pct: "-60%", tip: "≈-0.66 to -0.93 m/s late-race speed, plus ≈-0.13 to -0.19 m/s² acceleration now too. Avoid unless mandatory. Needs atleast 10 sparks." },
  F: { pct: "-80%", tip: "≈-0.88 to -1.24 m/s late-race speed, plus ≈-0.16 to -0.23 m/s² acceleration. Even max sparks (12) only gives you to C." },
  G: { pct: "-90%", tip: "≈-0.99 to -1.39 m/s late-race speed, plus ≈-0.20 to -0.28 m/s² acceleration. Worst case — only for a must-have trophy. Even max sparks (12) only gives you to C." },
};
const CATS = [
  { key: "turf", label: "Turf", group: "surface", stat: "Acceleration" },
  { key: "dirt", label: "Dirt", group: "surface", stat: "Acceleration" },
  { key: "sprint", label: "Sprint", group: "distance", stat: "Late-race Speed" },
  { key: "mile", label: "Mile", group: "distance", stat: "Late-race Speed" },
  { key: "medium", label: "Medium", group: "distance", stat: "Late-race Speed" },
  { key: "long", label: "Long", group: "distance", stat: "Late-race Speed" },
];
const SURFACE_KEYS = ["turf", "dirt"];
const DISTANCE_KEYS = ["sprint", "mile", "medium", "long"];
const SAFE_ID = /^[a-z0-9]{7}$/;
const MAX_NAME_LENGTH = 120;
const MAX_NOTE_LENGTH = 500;
const MAX_TROPHIES_PER_TRAINEE = 300;
export const MAX_MY_LIST = 1000;
export const MAX_IMPORT_TRAINEES = 500;
export const MAX_IMPORT_TROPHIES = 6000;
export const MAX_STORED_BYTES = 2 * 1024 * 1024;
const VALID_CAL_MONTHS = new Set([
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"
]);
const VALID_CAL_TURNS = new Set(["Early", "Late"]);

function defaultSettings() {
  return {
    allowCustomTrainees: true,
    allowCustomTrophies: true,
    calendarViewMode: false,
    lightMode: false,
    colorTheme: 'turf',
    activeTraineeId: null,
    navbarPositionDesktop: 'right',
    navbarPositionMobile: 'bottom'
  };
}
export let state = {
  myList: [],
  settings: defaultSettings()
};
let saveQueue = Promise.resolve();

const ID_CHARS = 'abcdefghijklmnopqrstuvwxyz0123456789';
export function uid() {
  let id = '';
  for (let i = 0; i < 7; i++) id += ID_CHARS[Math.floor(Math.random() * ID_CHARS.length)];
  return id;
}
export function debounce(fn, delay = 150) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
}
function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
function safeText(value, maxLength) {
  return typeof value === 'string' ? value.trim().slice(0, maxLength) : '';
}
function nextId(usedIds) {
  let id;
  do { id = uid(); } while (usedIds.has(id));
  usedIds.add(id);
  return id;
}
function normalizedId(value, usedIds) {
  if (typeof value === 'string' && SAFE_ID.test(value) && !usedIds.has(value)) {
    usedIds.add(value);
    return value;
  }
  return nextId(usedIds);
}
function normalizeAptitude(value) {
  if (typeof value === 'string') return GRADE_INFO[value] ? value : null;
  if (!isPlainObject(value) || !GRADE_INFO[value.base] || !GRADE_INFO[value.alt]) return null;
  return {
    base: value.base,
    alt: value.alt,
    note: safeText(value.note, MAX_NOTE_LENGTH)
  };
}
function normalizeAptitudes(value) {
  if (!isPlainObject(value)) return null;
  const aptitudes = {};
  for (const { key } of CATS) {
    const aptitude = normalizeAptitude(value[key]);
    if (!aptitude) return null;
    aptitudes[key] = aptitude;
  }
  return aptitudes;
}
function normalizeTrophy(value, usedIds) {
  if (!isPlainObject(value)) return null;
  const name = safeText(value.name, MAX_NAME_LENGTH);
  if (!name) return null;
  const trophy = {
    id: normalizedId(value.id, usedIds),
    name,
    checked: value.checked === true
  };
  const race = RACE_BY_NAME.get(name.toLowerCase());
  if (race) {
    trophy.grade = race.grade;
    trophy.track = race.track;
    trophy.distance = race.distance;
    trophy.year = race.year;
    trophy.turn = race.turn;
    trophy.month = race.month;
  }
  return trophy;
}
function isValidSlotKey(slotKey) {
  if (typeof slotKey !== 'string') return false;
  const parts = slotKey.split('|');
  if (parts.length !== 2) return false;
  return VALID_CAL_MONTHS.has(parts[0]) && VALID_CAL_TURNS.has(parts[1]);
}
function normalizeCalendarOrder(value) {
  if (!isPlainObject(value)) return {};
  const validRaceNames = new Set(RACES.map(race => race.name));
  const order = {};
  for (const [slotKey, names] of Object.entries(value)) {
    if (!Array.isArray(names) || !isValidSlotKey(slotKey)) continue;
    order[slotKey] = names
      .filter(name => typeof name === 'string' && validRaceNames.has(name))
      .slice(0, RACES.length);
  }
  return order;
}
function normalizeTrainee(value, usedTraineeIds) {
  if (!isPlainObject(value)) return null;
  const name = safeText(value.name, MAX_NAME_LENGTH);
  const aptitudes = normalizeAptitudes(value.aptitudes);
  if (!name || !aptitudes) return null;
  const usedTrophyIds = new Set();
  const trophies = Array.isArray(value.trophies)
    ? value.trophies.slice(0, MAX_TROPHIES_PER_TRAINEE)
      .map(trophy => normalizeTrophy(trophy, usedTrophyIds))
      .filter(Boolean)
    : [];
  return {
    id: normalizedId(value.id, usedTraineeIds),
    name,
    aptitudes,
    trophies,
    calendarOrder: normalizeCalendarOrder(value.calendarOrder)
  };
}
export function normalizeSettings(value, trainees) {
  const raw = isPlainObject(value) ? value : {};
  const settings = defaultSettings();
  for (const key of ['allowCustomTrainees', 'allowCustomTrophies', 'calendarViewMode', 'lightMode']) {
    if (typeof raw[key] === 'boolean') settings[key] = raw[key];
  }
  settings.colorTheme = raw.colorTheme === 'dirt' ? 'dirt' : 'turf';

  // Migration: legacy single-field `navbarPosition` → two-field model.
  const legacy = ['left', 'bottom', 'right', 'top'].includes(raw.navbarPosition)
    ? raw.navbarPosition
    : null;

  const desktopRaw = raw.navbarPositionDesktop ?? legacy ?? 'right';
  settings.navbarPositionDesktop = ['left', 'bottom', 'right', 'top'].includes(desktopRaw)
    ? desktopRaw
    : 'right';

  const mobileRaw = raw.navbarPositionMobile ?? legacy ?? 'bottom';
  if (['top', 'bottom'].includes(mobileRaw)) {
    settings.navbarPositionMobile = mobileRaw;
  } else {
    // Legacy 'left'/'right' has no mobile equivalent — the visual default is bottom.
    settings.navbarPositionMobile = 'bottom';
  }

  if (typeof raw.activeTraineeId === 'string' && trainees.some(t => t.id === raw.activeTraineeId)) {
    settings.activeTraineeId = raw.activeTraineeId;
  }
  return settings;
}
function normalizeTraineeList(value, usedTraineeIds = new Set()) {
  if (!Array.isArray(value)) return [];
  return value
    .map(trainee => normalizeTrainee(trainee, usedTraineeIds))
    .filter(Boolean);
}
export function normalizeImportedTrainees(value, existingTrainees = []) {
  const usedTraineeIds = new Set(
    Array.isArray(existingTrainees) ? existingTrainees.map(t => t.id).filter(id => SAFE_ID.test(id)) : []
  );
  return normalizeTraineeList(value, usedTraineeIds);
}
function normalizeState(value) {
  const raw = isPlainObject(value) ? value : {};
  const myList = normalizeTraineeList(raw.myList);
  return { myList, settings: normalizeSettings(raw.settings, myList) };
}
let storageHealthy = true;
export async function loadState() {
  let parsed = null;
  try {
    if (window.storage && typeof window.storage.get === 'function') {
      const res = await window.storage.get('mylist', false);
      if (res && res.value) {
        if (res.value.length > MAX_STORED_BYTES) throw new Error("stored data too large");
        parsed = JSON.parse(res.value);
      }
    } else {
      const val = localStorage.getItem('mylist');
      if (val) {
        if (val.length > MAX_STORED_BYTES) throw new Error("stored data too large");
        parsed = JSON.parse(val);
      }
    }
  } catch (e) {
    console.error("Storage load failed", e);
    storageHealthy = false;
    showToast("Saved data couldn't be read — starting fresh. Export a backup before making changes.", { kind: 'error', duration: 0 });
  }
  if (storageHealthy) state = normalizeState(parsed);
}
let saveTimer = null;
let saveFlush = null;
export function saveState() {
  // Never autosave over data we failed to load (would destroy it).
  if (!storageHealthy) return Promise.resolve();
  // Coalesce rapid toggles/drags into one trailing write; snapshot at flush.
  if (!saveFlush) {
    saveFlush = new Promise((resolve) => {
      saveTimer = setTimeout(async () => {
        saveTimer = null;
        let snapshot;
        try {
          snapshot = JSON.stringify(state);
        } catch (e) {
          console.error("Storage serialization failed", e);
          saveFlush = null;
          resolve();
          return;
        }
        saveQueue = saveQueue.catch(() => {}).then(async () => {
          try {
            if (window.storage && typeof window.storage.set === 'function') {
              await window.storage.set('mylist', snapshot, false);
            } else {
              localStorage.setItem('mylist', snapshot);
            }
          } catch (e) {
            console.error("Storage save failed", e);
            const isQuota = e && (e.name === 'QuotaExceededError' || e.code === 22);
            const message = isQuota
              ? "Storage is full — changes are NOT being saved. Export a backup, then remove old trainees."
              : "Couldn't save your list in this browser.";
            try {
              window.dispatchEvent(new CustomEvent('cb-toast', { detail: { message, kind: 'error', duration: isQuota ? 0 : 5000 } }));
            } catch (_) { /* ignore toast bridge failures */ }
          }
        });
        await saveQueue;
        saveFlush = null;
        resolve();
      }, 150);
    });
  }
  return saveFlush;
}

/* Re-run a render while keeping keyboard focus on the invoking control.
 * Matches by stable id, else by data attrs within the same id'd container. */
export function withFocusKept(fn) {
  const a = typeof document !== 'undefined' ? document.activeElement : null;
  let restore = null;
  if (a && a.isConnected && a !== document.body) {
    if (a.id) {
      const id = a.id;
      restore = () => document.getElementById(id)?.focus({ preventScroll: true });
    } else if (a.dataset) {
      const d = a.dataset;
      const host = a.closest ? a.closest('[id]') : null;
      const key = d.page !== undefined && d.page !== ''
        ? `[data-page="${CSS.escape(d.page)}"]`
        : d.pageAction ? `[data-page-action="${CSS.escape(d.pageAction)}"]`
        : d.switch ? `[data-switch="${CSS.escape(d.switch)}"]`
        : d.remove ? `[data-remove="${CSS.escape(d.remove)}"]`
        : d.addswitch ? `[data-addswitch="${CSS.escape(d.addswitch)}"]`
        : (d.move && d.race) ? `.cal-race-move[data-race="${CSS.escape(d.race)}"][data-move="${CSS.escape(d.move)}"]`
        : null;
      if (host && host.id && key) {
        const hid = host.id;
        restore = () => document.getElementById(hid)?.querySelector(key)?.focus({ preventScroll: true });
      }
    }
  }
  fn();
  try { restore?.(); } catch (_) { /* focus restore is best-effort */ }
}

/* ---------- Escaping ---------- */
// escapeHtml is for text nodes / element content (does NOT escape quotes).
// escapeAttr is for anything interpolated into an HTML attribute value.
const HTML_ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export function escapeHtml(str) {
  return String(str).replace(/[&<>]/g, ch => HTML_ESCAPES[ch]);
}
export function escapeAttr(str) {
  return String(str).replace(/[&<>"']/g, ch => HTML_ESCAPES[ch]);
}

export function gradeOf(v) { return typeof v === 'string' ? v : v.base; }
function altOf(v) { return typeof v === 'string' ? null : v; }

/* ---------- Tooltip ---------- */
let tooltipEl = null;
let tooltipTarget = null;
function ensureTooltipEl() {
  if (!tooltipEl) {
    tooltipEl = document.getElementById('tooltip');
    if (tooltipEl) tooltipEl.setAttribute('role', 'tooltip');
  }
  return tooltipEl;
}
function positionTooltip(target) {
  const el = ensureTooltipEl();
  if (!target || !el) return;
  const rect = target.getBoundingClientRect();
  const tipRect = el.getBoundingClientRect();
  const tooltipWidth = tipRect.width;
  const tooltipHeight = tipRect.height;
  const gap = 8;
  const left = Math.max(gap, Math.min(rect.left, window.innerWidth - tooltipWidth - 16));
  el.style.left = left + "px";
  let top = rect.top - tooltipHeight - gap;
  if (top < gap) top = rect.bottom + gap;
  // Clamp bottom edge so flipped-below tooltips stay onscreen.
  top = Math.min(top, window.innerHeight - tooltipHeight - gap);
  if (top < gap) top = gap;
  el.style.top = Math.max(top, gap) + "px";
  el.classList.add('show');
  el.setAttribute('aria-hidden', 'false');
}
function showTooltip(target, catKey, aptValue) {
  const el = ensureTooltipEl();
  if (!el) return;
  const cat = CATS.find(c => c.key === catKey);
  const grade = gradeOf(aptValue);
  const alt = altOf(aptValue);
  const info = GRADE_INFO[grade];
  const tipTable = cat.group === 'surface' ? GRADE_TIP_SURFACE : GRADE_TIP_DISTANCE;
  const tip = tipTable[grade];
  let html = `<div class="tt-head" style="color:var(--${info.tier}-text)">${cat.label} — ${grade}${alt ? ' / ' + alt.alt : ''}</div>
  <div class="tt-stat">${cat.stat} · ${tip.pct}</div>
  <div>${tip.tip}</div>`;
  if (alt) {
    html += `<div class="tt-variant">${escapeHtml(alt.note)}</div>`;
  }
  el.style.width = '';
  el.style.maxWidth = '';
  el.style.borderTopColor = `var(--${info.tier})`;
  el.innerHTML = html;
  tooltipTarget = target;
  positionTooltip(target);
}
function showTextTooltip(target, text) {
  const el = ensureTooltipEl();
  if (!el) return;
  el.style.width = 'auto';
  el.style.maxWidth = '200px';
  el.style.borderTopColor = '';
  el.innerHTML = `<div>${escapeHtml(text)}</div>`;
  tooltipTarget = target;
  positionTooltip(target);
}
function hideTooltip() {
  tooltipTarget = null;
  const el = ensureTooltipEl();
  if (!el) return;
  el.classList.remove('show');
  el.setAttribute('aria-hidden', 'true');
}

function repositionTooltip() {
  const el = ensureTooltipEl();
  if (!tooltipTarget || !el || !el.classList.contains('show')) return;
  if (!tooltipTarget.isConnected) {
    hideTooltip();
    return;
  }
  positionTooltip(tooltipTarget);
}

// Scroll events do not bubble from nested scrollers, so capture them at document level.
document.addEventListener('scroll', repositionTooltip, true);
window.addEventListener('resize', repositionTooltip);

function chipHtml(apt, key) {
  const cat = CATS.find(c => c.key === key);
  const value = apt[key];
  const grade = gradeOf(value);
  const alt = altOf(value);
  const tier = GRADE_INFO[grade].tier;
  const label = `${cat.label} ${grade}${alt ? '/' + alt.alt : ''}`;
  const tipTable = cat.group === 'surface' ? GRADE_TIP_SURFACE : GRADE_TIP_DISTANCE;
  const pct = tipTable[grade] ? tipTable[grade].pct : '';
  const ariaLabel = `${cat.label} aptitude ${grade}${alt ? ', alternate ' + alt.alt : ''}, ${cat.stat} ${pct}`;
  const borderMix = `color-mix(in srgb, var(--${tier}) 55%, transparent)`;
  const glowMix = `color-mix(in srgb, var(--${tier}) 40%, transparent)`;
  let bg = `color-mix(in srgb, var(--${tier}) 24%, transparent)`;
  if (alt) {
    const altTier = GRADE_INFO[alt.alt].tier;
    bg = `linear-gradient(90deg, color-mix(in srgb, var(--${tier}) 26%, transparent) 50%, color-mix(in srgb, var(--${altTier}) 26%, transparent) 50%)`;
  }
  const style = `--chip-bg:${bg};--chip-border:${borderMix};--chip-glow:${glowMix};`;
  // N6: escapeAttr round-trips correctly for any string (including literal `&amp;`).
  const safeJson = escapeAttr(JSON.stringify(value));
  return `<span class="chip" tabindex="0" style="${style}" data-cat="${key}" data-json='${safeJson}' aria-label="${escapeAttr(ariaLabel)}" aria-describedby="tooltip">${label}</span>`;
}
export function aptGroupsHtml(apt) {
  return `<div class="apt-groups">
  <div class="apt-container">${SURFACE_KEYS.map(k => chipHtml(apt, k)).join("")}</div>
  <div class="apt-container">${DISTANCE_KEYS.map(k => chipHtml(apt, k)).join("")}</div>
</div>`;
}
const chipWiredRoots = new WeakSet();
export function wireChips(root) {
  if (chipWiredRoots.has(root)) return;
  chipWiredRoots.add(root);
  root.addEventListener('error', (e) => {
    const img = e.target;
    if (!(img instanceof HTMLImageElement) || !img.matches('.trainee-icon img')) return;
    img.style.display = 'none';
    const fallback = img.nextElementSibling;
    if (fallback) fallback.style.display = 'flex';
  }, true);
  root.addEventListener('mouseover', (e) => {
    const chip = e.target.closest('.chip');
    if (chip && root.contains(chip)) {
      if (chip.contains(e.relatedTarget)) return;
      try {
        showTooltip(chip, chip.dataset.cat, JSON.parse(chip.dataset.json));
      } catch (_) { /* ignore tampered chip payloads */ }
      return;
    }
    const iconBtn = e.target.closest('[data-tooltip]');
    if (iconBtn && root.contains(iconBtn)) {
      if (iconBtn.contains(e.relatedTarget)) return;
      showTextTooltip(iconBtn, iconBtn.dataset.tooltip);
    }
  });
  root.addEventListener('mouseout', (e) => {
    const chip = e.target.closest('.chip');
    if (chip && root.contains(chip)) {
      if (chip.contains(e.relatedTarget)) return;
      hideTooltip();
      return;
    }
    const iconBtn = e.target.closest('[data-tooltip]');
    if (iconBtn && root.contains(iconBtn)) {
      if (iconBtn.contains(e.relatedTarget)) return;
      hideTooltip();
    }
  });
  root.addEventListener('focusin', (e) => {
    const chip = e.target.closest('.chip');
    if (chip && root.contains(chip)) {
      try {
        showTooltip(chip, chip.dataset.cat, JSON.parse(chip.dataset.json));
      } catch (_) { /* ignore tampered chip payloads */ }
      return;
    }
    const iconBtn = e.target.closest('[data-tooltip]');
    if (iconBtn && root.contains(iconBtn)) {
      showTextTooltip(iconBtn, iconBtn.dataset.tooltip);
    }
  });
  root.addEventListener('focusout', (e) => {
    const chip = e.target.closest('.chip');
    if (chip && root.contains(chip)) {
      hideTooltip();
      return;
    }
    const iconBtn = e.target.closest('[data-tooltip]');
    if (iconBtn && root.contains(iconBtn)) {
      hideTooltip();
    }
  });
}
function slugify(name) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}
const KNOWN_ICON_SLUGS = new Set(DATABASE.map(d => slugify(d.name)));
export function iconHtml(name, size) {
  const slug = slugify(name);
  const px = Math.min(96, Math.max(16, Number(size) || 32));
  const initial = escapeHtml((name.trim()[0] || '?').toUpperCase());
  // Custom names have no icon file — render the fallback directly, no 404.
  const img = KNOWN_ICON_SLUGS.has(slug)
    ? `<img src="../icons/${slug}.png" alt="" loading="lazy" decoding="async">`
    : '';
  return `<div class="trainee-icon" aria-hidden="true" style="--icon-size:${px}px">
  ${img}
  <span class="icon-fallback"${img ? '' : ' style="display:flex"'}>${initial}</span>
</div>`;
}
export function blankIconHtml(size) {
  const px = Math.min(96, Math.max(16, Number(size) || 32));
  return `<div class="trainee-icon trainee-icon-blank" aria-hidden="true" style="--icon-size:${px}px"></div>`;
}
export function raceDateLabel(r) {
  const yearLabel = r.year.replace(/,\s*/g, '/');
  return `${yearLabel} ${r.turn} ${r.month}`;
}
export function weakAptitudes(apt) {
  const dThreshold = GRADES.indexOf("D");
  return CATS
    .map(c => ({ ...c, grade: gradeOf(apt[c.key]) }))
    .filter(c => GRADES.indexOf(c.grade) >= dThreshold)
    .sort((a, b) => GRADES.indexOf(b.grade) - GRADES.indexOf(a.grade));
}
export function sortRowsByMode(rows, mode) {
  if (mode === "az") return [...rows].sort((a, b) => a.name.localeCompare(b.name));
  if (mode === "za") return [...rows].sort((a, b) => b.name.localeCompare(a.name));
  return rows;
}

/* ---------- Shared trainee-name canonicalisation ---------- */
export function traineeNameKey(name) {
  return (name || "")
    .normalize('NFKC')
    .trim()
    .replace(/\s+/g, ' ')
    .toLocaleLowerCase();
}

/* ---------- Race helpers ---------- */
const RACE_BY_NAME = new Map(RACES.map(r => [(r.name || "").trim().toLowerCase(), r]));
export function findRaceByExactName(name) {
  const q = (name || "").trim().toLowerCase();
  return RACE_BY_NAME.get(q);
}
export function raceMeta(race) {
  return {
    grade: race.grade, track: race.track, distance: race.distance,
    year: race.year, turn: race.turn, month: race.month
  };
}

/* ---------- State actions (render via bus to avoid cycles) ---------- */

export function addToMyList(name, apt, opts = {}) {
  const { announce = true } = opts;
  const normalizedName = traineeNameKey(name);
  if (!normalizedName) return null;
  if (state.myList.some(t => traineeNameKey(t.name) === normalizedName)) {
    if (announce) showToast(`“${name.normalize('NFKC').trim().replace(/\s+/g, ' ')}” is already in My List.`);
    return null;
  }
  if (state.myList.length >= MAX_MY_LIST) {
    if (announce) showToast(`My List is full (${MAX_MY_LIST}). Remove someone first.`, { kind: 'error' });
    return null;
  }
  const canonicalName = safeText(name.normalize('NFKC').trim().replace(/\s+/g, ' '), MAX_NAME_LENGTH);
  if (!canonicalName) return null;
  const trainee = { id: uid(), name: canonicalName, aptitudes: apt, trophies: [] };
  state.myList.push(trainee);
  saveState();
  renderMyList();
  window.dispatchEvent(new CustomEvent('cb-db-button', { detail: { name: canonicalName, inList: true } }));
  if (announce) showToast(`Added ${canonicalName} to My List.`, {
    actionLabel: 'View',
    duration: 8000,
    onAction: () => {
      window.dispatchEvent(new CustomEvent('cb-view-trainee', { detail: { id: trainee.id } }));
    }
  });
  return trainee;
}

export function removeFromMyList(id) {
  const index = state.myList.findIndex(t => t.id === id);
  if (index === -1) return;
  const [removed] = state.myList.splice(index, 1);
  if (state.settings.activeTraineeId === id) {
    state.settings.activeTraineeId = state.myList.length ? state.myList[0].id : null;
  }
  saveState();
  renderMyList();
  window.dispatchEvent(new CustomEvent('cb-db-button', { detail: { name: removed.name, inList: false } }));
  showToast(`Removed ${removed.name}`, {
    actionLabel: 'Undo',
    duration: 8000,
    onAction: () => {
      if (state.myList.some(t => traineeNameKey(t.name) === traineeNameKey(removed.name))) {
        showToast(`Couldn't undo — “${removed.name}” is already in My List.`, { kind: 'error' });
        return;
      }
      const at = Math.min(index, state.myList.length);
      state.myList.splice(at, 0, removed);
      saveState();
      renderMyList();
      window.dispatchEvent(new CustomEvent('cb-db-button', { detail: { name: removed.name, inList: true } }));
    }
  });
}

export function addTrophy(tid, name, meta) {
  const clean = safeText(name, MAX_NAME_LENGTH);
  if (!clean) return false;
  const t = state.myList.find(x => x.id === tid);
  if (!t) return false;
  if (t.trophies.length >= MAX_TROPHIES_PER_TRAINEE) {
    showToast(`${t.name} already has ${MAX_TROPHIES_PER_TRAINEE} trophies.`, { kind: 'error' });
    return false;
  }
  const key = traineeNameKey(clean);
  if (t.trophies.some(tr => traineeNameKey(tr.name) === key)) return false;
  const trophy = { id: uid(), name: clean, checked: false };
  if (meta) {
    trophy.grade = meta.grade; trophy.track = meta.track; trophy.distance = meta.distance;
    trophy.year = meta.year; trophy.turn = meta.turn; trophy.month = meta.month;
  }
  t.trophies.push(trophy);
  saveState(); renderMyList();
  return true;
}

export function setTrophyChecked(tid, trid, checked) {
  const t = state.myList.find(x => x.id === tid);
  if (!t) return null;
  const tr = t.trophies.find(x => x.id === trid);
  if (!tr) return null;
  tr.checked = checked;
  saveState();
  return { trainee: t, trophy: tr };
}

export function removeTrophy(tid, trid) {
  const t = state.myList.find(x => x.id === tid);
  if (!t) return;
  const index = t.trophies.findIndex(x => x.id === trid);
  if (index === -1) return;
  const [removed] = t.trophies.splice(index, 1);
  saveState(); renderMyList();
  showToast(`Removed ${removed.name}`, {
    actionLabel: 'Undo',
    duration: 8000,
    onAction: () => {
      const host = state.myList.find(x => x.id === tid);
      if (!host) {
        showToast(`Couldn't undo — ${t.name} is no longer in My List.`, { kind: 'error' });
        return;
      }
      host.trophies.splice(Math.min(index, host.trophies.length), 0, removed);
      saveState(); renderMyList();
    }
  });
}

export function addTrophyFromInput(tid, rawName) {
  const name = (rawName || "").trim();
  if (!name) return false;
  const race = findRaceByExactName(name);
  if (!race && !state.settings.allowCustomTrophies) {
    showToast("Custom trophies are disabled in settings.", { kind: 'error' });
    return false;
  }
  const host = state.myList.find(x => x.id === tid);
  if (host && host.trophies.some(tr => traineeNameKey(tr.name) === traineeNameKey(name))) {
    showToast(`“${name}” is already in ${host.name}'s list.`);
    return false;
  }
  return addTrophy(tid, name, race ? raceMeta(race) : null);
}

/* Contrast-checked tag foregrounds (measured 2026-09-20):
 * bright tier greens/yellow/orange (a-f, g3) read best with dark text
 * (6-12:1 vs 1.5-3:1 for white); only the dark bgs g (#c23f5a, 5.06:1)
 * and g1 (#2f6fd0, 4.88:1) need white text. */
const LIGHT_TEXT_TAG_VARS = new Set(['g1', 'g']);
export function tagFgForVar(varName) {
  return LIGHT_TEXT_TAG_VARS.has(varName) ? '#fff' : '#12141a';
}

export function wireTabArrowNav(container) {
  if (!container || container.dataset.tabsWired) return;
  container.dataset.tabsWired = 'true';
  container.addEventListener('keydown', (e) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) return;
    const tabs = [...container.querySelectorAll('[role="tab"]')];
    if (tabs.length < 2) return;
    e.preventDefault();
    const idx = tabs.indexOf(document.activeElement);
    const current = idx === -1 ? tabs.findIndex(t => t.classList.contains('active')) : idx;
    let next = current;
    if (e.key === 'ArrowRight') next = (current + 1) % tabs.length;
    if (e.key === 'ArrowLeft') next = (current - 1 + tabs.length) % tabs.length;
    if (e.key === 'Home') next = 0;
    if (e.key === 'End') next = tabs.length - 1;
    tabs[next].focus();
    tabs[next].click();
  });
}

/* ---------- Toast (undo + status) ----------
 * Stacked; plain toasts cap at MAX_TOASTS while action toasts (Undo/View)
 * are exempt up to MAX_ACTION_TOASTS so rapid deletes never eat recovery.
 * Error toasts share one slot so bursts can't pile up or clobber Undo;
 * auto-dismiss waits out :focus-within; duration<=0 never auto-dismisses. */
const MAX_TOASTS = 3;
const MAX_ACTION_TOASTS = 6;
let errorToast = null;
function armToastDismiss(el, duration) {
  if (duration <= 0) return null;
  const clearIfUnfocused = () => {
    if (el.contains(document.activeElement)) {
      el._retry = setTimeout(clearIfUnfocused, 1000);
      return;
    }
    el.remove();
    if (errorToast === el) errorToast = null;
  };
  return setTimeout(clearIfUnfocused, duration);
}
export function showToast(message, opts = {}) {
  let region = document.getElementById('toast-region');
  if (!region) {
    // Self-heal: older cached HTML may lack the region — create it so
    // toasts never silently vanish.
    region = document.createElement('div');
    region.id = 'toast-region';
    region.className = 'toast-region';
    region.setAttribute('aria-live', 'polite');
    region.setAttribute('aria-atomic', 'true');
    document.body.appendChild(region);
  }
  const { actionLabel, onAction, kind = 'info', duration = 5000 } = opts;
  const hasAction = !!(actionLabel && typeof onAction === 'function');
  if (kind === 'error' && errorToast && errorToast.isConnected) {
    errorToast.querySelector('span').textContent = message;
    if (errorToast._timer) clearTimeout(errorToast._timer);
    if (errorToast._retry) clearTimeout(errorToast._retry);
    errorToast._timer = armToastDismiss(errorToast, duration);
    return errorToast;
  }
  while (region.children.length >= (hasAction ? MAX_ACTION_TOASTS : MAX_TOASTS)) {
    const plain = [...region.children].find(c => !c.querySelector('button'));
    (plain || region.firstChild).remove();
  }
  const el = document.createElement('div');
  el.className = 'toast';
  // No role=status here: the region itself is the single live source.
  const text = document.createElement('span');
  text.textContent = message;
  el.appendChild(text);
  if (actionLabel && typeof onAction === 'function') {
    const btn = document.createElement('button');
    btn.className = 'btn small';
    btn.textContent = actionLabel;
    btn.addEventListener('click', () => {
      onAction();
      if (el._timer) clearTimeout(el._timer);
      if (el._retry) clearTimeout(el._retry);
      el.remove();
      if (errorToast === el) errorToast = null;
    });
    el.appendChild(btn);
  }
  if (kind === 'error') {
    el.style.borderColor = 'var(--f)';
    el.setAttribute('role', 'alert');
    errorToast = el;
  }
  region.appendChild(el);
  el._timer = armToastDismiss(el, duration);
  return el;
}

window.addEventListener('cb-toast', (e) => {
  const detail = e && e.detail ? e.detail : {};
  showToast(detail.message || 'Something happened.', { kind: detail.kind || 'info', duration: detail.duration ?? 5000 });
});

/* Polite one-shot announcements for silent visual toggles (no toast spam). */
export function announce(message) {
  let el = document.getElementById('sr-announcer');
  if (!el) {
    el = document.createElement('div');
    el.id = 'sr-announcer';
    el.className = 'sr-only';
    el.setAttribute('aria-live', 'polite');
    document.body.appendChild(el);
  }
  el.textContent = '';
  requestAnimationFrame(() => { el.textContent = message; });
}