// App shell: navigation rail, theme toggle, hash router with view transitions.
import { h, icon, $, clear } from './lib/dom.js';
import { loadAll } from './lib/store.js';
import * as home from './pages/home.js';
import * as openings from './pages/openings.js';
import * as tactics from './pages/tactics.js';
import * as strategy from './pages/strategy.js';
import * as endgames from './pages/endgames.js';
import * as train from './pages/train.js';
import * as practice from './pages/practice.js';
import * as guide from './pages/guide.js';
import * as review from './pages/review.js';
import * as progressPage from './pages/progress.js';
import * as games from './pages/games.js';
import * as daily from './pages/daily.js';
import * as week from './pages/week.js';
import { initSearch, openSearch } from './lib/search.js';
import { soundOn, setSound } from './lib/sound.js';

// [path, label, icon, shown in the phone tab bar]
const NAV = [
  ['', 'Home', 'home', true],
  ['guide', 'Roadmap', 'map', true],
  ['openings', 'Openings', 'book', true],
  ['tactics', 'Tactics', 'bolt', false],
  ['strategy', 'Strategy', 'compass', false],
  ['endgames', 'Endgames', 'flag', false],
  ['practice', 'Practice', 'target', true],
  ['train', 'Trainers', 'eye', false],
];
const ROUTES = {
  '': home.render,
  openings: (data, id, sub) => (id ? openings.renderDetail(data, id, sub) : openings.render(data)),
  tactics: (data, id, sub) => (id ? tactics.renderDetail(data, id, sub) : tactics.render(data)),
  strategy: strategy.render,
  endgames: (data, id) => (id ? endgames.renderDetail(data, id) : endgames.render(data)),
  train: train.render,
  practice: practice.render,
  guide: guide.render,
  review: review.render,
  progress: progressPage.render,
  games: games.render,
  daily: daily.render,
  week: week.render,
};

// ---------- sound toggle
function soundButton() {
  const btn = h('button.theme-toggle.sound-toggle', { type: 'button', onclick: () => setSound(!soundOn()) });
  const paint = () => {
    btn.replaceChildren(icon(soundOn() ? 'sound' : 'mute'), h('span.nav-label', soundOn() ? 'Sound on' : 'Sound off'));
    btn.setAttribute('aria-pressed', String(soundOn()));
    btn.setAttribute('aria-label', soundOn() ? 'Turn move sounds off' : 'Turn move sounds on');
  };
  document.addEventListener('soundchange', paint);
  paint();
  return btn;
}

// ---------- theme
const THEME_KEY = 'chess-academy-theme';
const currentTheme = () => document.documentElement.dataset.theme || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
function themeButton() {
  const btn = h('button.theme-toggle', { type: 'button' });
  const paint = () => {
    const dark = currentTheme() === 'dark';
    btn.replaceChildren(icon(dark ? 'sun' : 'moon'), h('span.nav-label', dark ? 'Light theme' : 'Dark theme'));
    btn.setAttribute('aria-label', dark ? 'Switch to light theme' : 'Switch to dark theme');
  };
  btn.addEventListener('click', () => {
    const next = currentTheme() === 'dark' ? 'light' : 'dark';
    const apply = () => { document.documentElement.dataset.theme = next; document.dispatchEvent(new Event('themechange')); };
    document.startViewTransition ? document.startViewTransition(apply) : apply();
    try { localStorage.setItem(THEME_KEY, next); } catch { /* ignore */ }
  });
  paint();
  document.addEventListener('themechange', paint); // keep every toggle (rail + phone sheet) in sync
  return btn;
}

function renderRail() {
  const rail = $('#rail');
  rail.append(
    h('a.brand', { href: '#/' }, h('span.brand-mark', { 'aria-hidden': 'true' }), h('span.brand-name', 'Chess', h('br'), 'Strategy Academy')),
    h('button.search-btn', { type: 'button', onclick: () => openSearch(), 'aria-label': 'Search (Ctrl+K)' }, icon('search', 18), h('span', 'Search'), h('kbd', '/')),
    h('nav.nav', { 'aria-label': 'Sections' },
      NAV.map(([path, label, ic, tab]) => h('a.nav-link' + (tab ? '' : '.nav-secondary'), { href: '#/' + path, 'data-path': path }, icon(ic), h('span.nav-label', label))),
      h('button.nav-link.nav-more', { type: 'button', 'aria-expanded': 'false', 'aria-controls': 'more-sheet', onclick: () => toggleMore() }, icon('menu'), h('span.nav-label', 'More'))),
    h('div.rail-toggles', soundButton(), themeButton()),
  );
  // phone "More" sheet: everything that doesn't fit in the tab bar
  const sheet = h('div.more-sheet#more-sheet', { hidden: true, role: 'dialog', 'aria-label': 'More sections' },
    h('div.more-backdrop', { onclick: () => toggleMore(false) }),
    h('div.more-panel',
      h('div.more-grip'),
      h('button.btn.more-search', { type: 'button', onclick: () => { toggleMore(false); openSearch(); } }, icon('search', 18), 'Search everything'),
      h('div.more-grid', NAV.filter((n) => !n[3]).map(([path, label, ic]) => h('a.more-link', { href: '#/' + path, onclick: () => toggleMore(false) }, icon(ic, 24), label)),
        h('a.more-link', { href: '#/guide/think', onclick: () => toggleMore(false) }, icon('target', 24), 'How to think'),
        h('a.more-link', { href: '#/guide/attack', onclick: () => toggleMore(false) }, icon('flag', 24), 'Attack'),
        h('a.more-link', { href: '#/guide/memory', onclick: () => toggleMore(false) }, icon('eye', 24), 'Memory'),
        h('a.more-link', { href: '#/daily', onclick: () => toggleMore(false) }, icon('bolt', 24), 'Daily puzzle'),
        h('a.more-link', { href: '#/games', onclick: () => toggleMore(false) }, icon('book', 24), 'Classic games'),
        h('a.more-link', { href: '#/review', onclick: () => toggleMore(false) }, icon('search', 24), 'Review a game'),
        h('a.more-link', { href: '#/week', onclick: () => toggleMore(false) }, icon('map', 24), 'Your week'),
        h('a.more-link', { href: '#/progress', onclick: () => toggleMore(false) }, icon('check', 24), 'My progress')),
      h('div.more-toggles', soundButton(), themeButton())));
  document.body.append(sheet);
  // phones: a floating search button (the tab bar has no room)
  document.body.append(h('button.search-fab', { type: 'button', 'aria-label': 'Search', onclick: () => openSearch() }, icon('search', 20)));
}
function toggleMore(force) {
  const sheet = $('#more-sheet'), btn = $('.nav-more');
  const open = force ?? sheet.hidden;
  sheet.hidden = !open;
  btn.setAttribute('aria-expanded', String(open));
  document.body.classList.toggle('sheet-open', open);
}
function markNav(section) {
  document.querySelectorAll('.nav-link').forEach((a) => {
    const on = a.dataset.path === section || (!a.dataset.path && !section);
    a.classList.toggle('active', on);
    on ? a.setAttribute('aria-current', 'page') : a.removeAttribute('aria-current');
  });
  // highlight "More" on phones when the current section lives in the sheet
  const inSheet = NAV.some(([p, , , tab]) => !tab && p === section);
  document.querySelector('.nav-more')?.classList.toggle('active', inSheet);
}

// ---------- router
let data;
let lastSection = null;
async function route() {
  if (location.hash && !location.hash.startsWith('#/')) return; // in-page anchors aren't routes
  const [section = '', id, sub, ...rest] = location.hash.replace(/^#\/?/, '').split('/').map(decodeURIComponent);
  const view = $('#view');
  const render = ROUTES[section];
  const paint = () => {
    if (!$('#more-sheet')?.hidden) toggleMore(false);
    clear(view);
    try {
      const page = render ? render(data, id, sub, ...rest) : notFound();
      view.append(page);
      const t = page.dataset?.title;
      document.title = t ? `${t} · Chess Strategy Academy` : 'Chess Strategy Academy';
    } catch (err) {
      console.error(err);
      view.append(h('section.page', h('h1', 'This page failed to load'), h('p', err.message), h('p', h('a', { href: '#/' }, 'Back to home'))));
    }
    markNav(section);
  };
  const sameSection = section === lastSection;
  lastSection = section;
  if (document.startViewTransition && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
    document.documentElement.dataset.nav = sameSection ? 'inner' : 'section';
    await document.startViewTransition(paint).finished.catch(() => {});
  } else {
    paint();
    view.classList.remove('enter'); void view.offsetWidth; view.classList.add('enter');
  }
  if (!sameSection || !id) window.scrollTo({ top: 0 });
  view.focus({ preventScroll: true });
}
const notFound = () => h('section.page', { 'data-title': 'Not found' }, h('h1', 'No such page'), h('p', 'That address doesn\'t match any lesson.'), h('p', h('a', { href: '#/' }, 'Go to the home page')));

renderRail();
// offline support: service worker scoped to this folder, plus a small connectivity notice
if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => { /* offline mode is optional */ }));
}
const netToast = h('div.net-toast', { role: 'status', hidden: true });
document.body.append(netToast);
const showNet = (online) => {
  netToast.textContent = online ? 'Back online.' : 'You are offline — the whole course still works.';
  netToast.className = 'net-toast ' + (online ? 'net-on' : 'net-off');
  netToast.hidden = false;
  clearTimeout(showNet.t); showNet.t = setTimeout(() => (netToast.hidden = true), online ? 2500 : 6000);
};
window.addEventListener('offline', () => showNet(false));
window.addEventListener('online', () => showNet(true));
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !$('#more-sheet').hidden) toggleMore(false); });
$('#skip').addEventListener('click', (e) => { e.preventDefault(); $('#view').focus(); });
loadAll()
  .then((d) => { data = d; initSearch(d); window.addEventListener('hashchange', route); route(); })
  .catch((err) => {
    $('#view').replaceChildren(h('section.page', h('h1', 'Lesson data didn\'t load'), h('p', err.message),
      h('p', 'If you opened index.html straight from disk, serve the folder instead: ', h('code', 'npm start'), ' or ', h('code', 'python3 -m http.server'), '.')));
  });
