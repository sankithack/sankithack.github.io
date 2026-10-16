// App shell: hash router, navigation, theme, service worker.
import { db, settings } from './storage.js';

const ICONS = {
  home: '<path d="M3 11l9-8 9 8v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>',
  learn: '<path d="M2 6l10-4 10 4-10 4z"/><path d="M6 8v6c0 2 3 4 6 4s6-2 6-4V8"/>',
  palace: '<path d="M3 21h18M5 21V10M19 21V10M9 21v-6h6v6M2 10l10-7 10 7z"/>',
  train: '<rect x="3" y="5" width="14" height="14" rx="2"/><path d="M7 3h12a2 2 0 0 1 2 2v12"/>',
  events: '<circle cx="12" cy="13" r="8"/><path d="M12 9v4l2 2M9 2h6"/>',
  progress: '<path d="M3 3v18h18"/><path d="M7 15l4-4 3 3 6-6"/>',
};

const NAV = [
  ['', 'Home', 'home'],
  ['learn', 'Learn', 'learn'],
  ['palaces', 'Palaces', 'palace'],
  ['train', 'Trainers', 'train'],
  ['events', 'Events', 'events'],
  ['progress', 'Progress', 'progress'],
];

// First path segment -> lazily loaded view module exposing render(el, params).
const ROUTES = {
  '': () => import('./views/dashboard.js'),
  learn: () => import('./views/learn.js'),
  palaces: () => import('./views/palaces.js'),
  train: () => import('./views/trainers.js'),
  events: () => import('./views/events/index.js'),
  progress: () => import('./views/progress.js'),
  settings: () => import('./views/settings.js'),
};

const app = document.getElementById('app');
let cleanup = null;
let navToken = 0;

function svgIcon(name) {
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name]}</svg>`;
}

function renderNav() {
  document.getElementById('nav').innerHTML = NAV.map(
    ([path, label, icon]) => `<a href="#/${path}" data-path="${path}">${svgIcon(icon)}<span>${label}</span></a>`
  ).join('');
}

function parseHash() {
  const raw = location.hash.replace(/^#\/?/, '');
  const [path, query = ''] = raw.split('?');
  const parts = path.split('/').filter(Boolean).map(decodeURIComponent);
  return { section: parts[0] || '', params: parts.slice(1), query: new URLSearchParams(query) };
}

async function route() {
  const token = ++navToken;
  const { section, params, query } = parseHash();
  if (typeof cleanup === 'function') {
    try { cleanup(); } catch (e) { console.error(e); }
  }
  cleanup = null;
  if (window.speechSynthesis) speechSynthesis.cancel();

  document.querySelectorAll('#nav a').forEach((a) => a.classList.toggle('active', a.dataset.path === section));
  document.querySelector('.icon-btn')?.classList.toggle('active', section === 'settings');

  const loader = ROUTES[section];
  if (!loader) {
    app.innerHTML = `<div class="card"><h1>Page not found</h1><p><a href="#/">Go to the dashboard</a></p></div>`;
    return;
  }
  try {
    const mod = await loader();
    if (token !== navToken) return; // user navigated again while loading
    app.innerHTML = '';
    window.scrollTo(0, 0);
    cleanup = await mod.render(app, params, query);
  } catch (e) {
    console.error(e);
    app.innerHTML = `<div class="card"><h1>Something went wrong</h1><p class="muted">${String(e.message || e)}</p><p><a href="#/">Back to the dashboard</a></p></div>`;
  }
}

export function applyTheme() {
  const t = settings().theme;
  if (t === 'auto') document.documentElement.removeAttribute('data-theme');
  else document.documentElement.dataset.theme = t;
}

db();
applyTheme();
renderNav();
window.addEventListener('hashchange', route);
route();

if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch((e) => console.warn('Service worker not registered', e));
  });
}
