// App shell: navigation rail, theme toggle, hash router with view transitions.
import { h, icon, $, clear } from './lib/dom.js';
import { loadAll } from './lib/store.js';
import * as home from './pages/home.js';
import * as openings from './pages/openings.js';
import * as tactics from './pages/tactics.js';
import * as strategy from './pages/strategy.js';
import * as endgames from './pages/endgames.js';
import * as train from './pages/train.js';

const NAV = [
  ['', 'Home', 'home'],
  ['openings', 'Openings', 'book'],
  ['tactics', 'Tactics', 'bolt'],
  ['strategy', 'Strategy', 'compass'],
  ['endgames', 'Endgames', 'flag'],
  ['train', 'Train', 'target'],
];
const ROUTES = {
  '': home.render,
  openings: (data, id) => (id ? openings.renderDetail(data, id) : openings.render(data)),
  tactics: (data, id) => (id ? tactics.renderDetail(data, id) : tactics.render(data)),
  strategy: strategy.render,
  endgames: (data, id) => (id ? endgames.renderDetail(data, id) : endgames.render(data)),
  train: train.render,
};

// ---------- theme
const THEME_KEY = 'chess-academy-theme';
const currentTheme = () => document.documentElement.dataset.theme || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
function themeButton() {
  const btn = h('button.theme-toggle', { type: 'button' });
  const paint = () => {
    const dark = currentTheme() === 'dark';
    btn.replaceChildren(icon(dark ? 'sun' : 'moon'), h('span.nav-label', dark ? 'Light board' : 'Dark board'));
    btn.setAttribute('aria-label', dark ? 'Switch to light theme' : 'Switch to dark theme');
  };
  btn.addEventListener('click', () => {
    const next = currentTheme() === 'dark' ? 'light' : 'dark';
    const apply = () => { document.documentElement.dataset.theme = next; paint(); };
    document.startViewTransition ? document.startViewTransition(apply) : apply();
    try { localStorage.setItem(THEME_KEY, next); } catch { /* ignore */ }
  });
  paint();
  return btn;
}

function renderRail() {
  const rail = $('#rail');
  rail.append(
    h('a.brand', { href: '#/' }, h('span.brand-mark', { 'aria-hidden': 'true' }), h('span.brand-name', 'Chess', h('br'), 'Strategy Academy')),
    h('nav.nav', { 'aria-label': 'Sections' },
      NAV.map(([path, label, ic]) => h('a.nav-link', { href: '#/' + path, 'data-path': path }, icon(ic), h('span.nav-label', label)))),
    themeButton(),
  );
}
function markNav(section) {
  document.querySelectorAll('.nav-link').forEach((a) => {
    const on = a.dataset.path === section;
    a.classList.toggle('active', on);
    on ? a.setAttribute('aria-current', 'page') : a.removeAttribute('aria-current');
  });
}

// ---------- router
let data;
let lastSection = null;
async function route() {
  const [section = '', id, sub] = location.hash.replace(/^#\/?/, '').split('/').map(decodeURIComponent);
  const view = $('#view');
  const render = ROUTES[section];
  const paint = () => {
    clear(view);
    try {
      const page = render ? render(data, id, sub) : notFound();
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
loadAll()
  .then((d) => { data = d; window.addEventListener('hashchange', route); route(); })
  .catch((err) => {
    $('#view').replaceChildren(h('section.page', h('h1', 'Lesson data didn\'t load'), h('p', err.message),
      h('p', 'If you opened index.html straight from disk, serve the folder instead: ', h('code', 'npm start'), ' or ', h('code', 'python3 -m http.server'), '.')));
  });
