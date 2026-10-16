// All persistent state lives under one localStorage key.
// Shape is versioned so older backups can be migrated on import.
import { dateKey, addDays, downloadFile } from './utils.js';

const KEY = 'memtrain.v1';
export const SCHEMA_VERSION = 1;

// Unlock rule: next level opens after 2 of the last 3 attempts at a level reach 90%.
export const UNLOCK_ACCURACY = 0.9;
const UNLOCK_WINDOW = 3;
const UNLOCK_NEEDED = 2;

function defaults() {
  return {
    version: SCHEMA_VERSION,
    created: new Date().toISOString(),
    settings: {
      theme: 'auto',          // auto | light | dark
      strict: false,          // championship-style row scoring
      speechRate: 1,          // spoken digits per second
      voice: '',
      newPerDay: 10,          // new flashcards introduced per day per deck
      numberMode: 'major',    // major | pao (what the numbers trainer reveals)
      cardMode: 'image',      // image | pao
    },
    results: [],              // event sessions
    palaces: [],              // {id, name, loci:[string], created, practice:[{date, correct, total}]}
    systems: { major: {}, pao: {}, cards: {}, cardPao: {} }, // overrides of default lists
    srs: {},                  // itemId -> {ef, reps, interval, due, lapses, introduced}
    drills: {},               // deck -> [{date, n, avg, misses}] speed-drill history
    curriculum: { startDate: null, unlocked: {} },
    eventPrefs: {},           // event -> {lastLevel, opts} remembered setup choices
    activity: {},             // YYYY-MM-DD -> {events:{id:n}, srs:n, lessons:[], palace:n}
    lessonsDone: [],
  };
}

// Fill in any keys missing from older/partial data without clobbering existing values.
function fillDefaults(target, def) {
  for (const [k, v] of Object.entries(def)) {
    if (!(k in target) || target[k] === null && v !== null) target[k] = v;
    else if (v && typeof v === 'object' && !Array.isArray(v) && target[k] && typeof target[k] === 'object') {
      fillDefaults(target[k], v);
    }
  }
  return target;
}

function migrate(data) {
  // Future schema changes go here, e.g. if (data.version < 2) { ...; data.version = 2; }
  data.version = SCHEMA_VERSION;
  return fillDefaults(data, defaults());
}

let state = null;
let warned = false;

export function db() {
  if (state) return state;
  try {
    const raw = localStorage.getItem(KEY);
    state = raw ? migrate(JSON.parse(raw)) : defaults();
  } catch (e) {
    console.warn('Could not read saved data, starting fresh', e);
    state = defaults();
  }
  return state;
}

export function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify(db()));
  } catch (e) {
    console.error('Saving failed', e);
    if (!warned) {
      warned = true;
      alert('Your browser refused to save progress (storage full or disabled). Export a backup from Settings.');
    }
  }
}

export function update(fn) {
  const result = fn(db());
  save();
  return result;
}

export const settings = () => db().settings;

/* ---------- Backup ---------- */
export function exportData() {
  const payload = { app: 'loci-memory-training', exported: new Date().toISOString(), data: db() };
  downloadFile(`loci-backup-${dateKey()}.json`, JSON.stringify(payload, null, 2));
}

export function validateImport(parsed) {
  const data = parsed && parsed.data && typeof parsed.data === 'object' ? parsed.data : parsed;
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('File is not a Loci backup.');
  if (typeof data.version !== 'number') throw new Error('Backup has no version number.');
  if (data.version > SCHEMA_VERSION) throw new Error('Backup was made by a newer version of the site.');
  if (data.results && !Array.isArray(data.results)) throw new Error('Backup results are malformed.');
  if (data.palaces && !Array.isArray(data.palaces)) throw new Error('Backup palaces are malformed.');
  return data;
}

export async function importData(file) {
  const text = await file.text();
  let parsed;
  try { parsed = JSON.parse(text); } catch { throw new Error('File is not valid JSON.'); }
  const data = validateImport(parsed);
  state = migrate(structuredClone(data));
  save();
  return state;
}

export function resetAll() {
  state = defaults();
  save();
}

/* ---------- Activity & streak ---------- */
export function logActivity(kind, id) {
  update((d) => {
    const k = dateKey();
    const day = (d.activity[k] ||= { events: {}, srs: 0, lessons: [], palace: 0 });
    if (kind === 'event') day.events[id] = (day.events[id] || 0) + 1;
    else if (kind === 'srs') day.srs += id || 1;
    else if (kind === 'lesson' && !day.lessons.includes(id)) day.lessons.push(id);
    else if (kind === 'palace') day.palace += 1;
  });
}

export function todayActivity() {
  return db().activity[dateKey()] || { events: {}, srs: 0, lessons: [], palace: 0 };
}

const isActive = (day) => day && (Object.keys(day.events).length || day.srs || day.lessons.length || day.palace);

export function streak() {
  const act = db().activity;
  let k = dateKey();
  // Today not trained yet still keeps yesterday's streak alive.
  if (!isActive(act[k])) k = addDays(k, -1);
  let n = 0;
  while (isActive(act[k])) { n++; k = addDays(k, -1); }
  return n;
}

/* ---------- Results & levels ---------- */
export function addResult(r) {
  update((d) => { d.results.push(r); });
  logActivity('event', r.event);
}

export const resultsFor = (event) => db().results.filter((r) => r.event === event);

export function unlockedLevel(event) {
  return db().curriculum.unlocked[event] ?? 0;
}

/** Returns true when this result unlocked a new level. */
export function checkUnlock(event, level, maxLevel) {
  if (level < 0 || level !== unlockedLevel(event) || level >= maxLevel) return false;
  const recent = resultsFor(event).filter((r) => r.level === level).slice(-UNLOCK_WINDOW);
  const good = recent.filter((r) => r.accuracy >= UNLOCK_ACCURACY).length;
  if (good >= UNLOCK_NEEDED) {
    update((d) => { d.curriculum.unlocked[event] = level + 1; });
    return true;
  }
  return false;
}

export function bestResult(event) {
  return resultsFor(event).reduce((best, r) => (!best || r.score > best.score || (r.score === best.score && r.memTime < best.memTime) ? r : best), null);
}

export const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
