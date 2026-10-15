import { h, icon, cap } from '../lib/dom.js';
import { LineViewer } from '../lib/viewer.js';
import { lineText } from '../lib/line.js';
import { markSeen, isSeen } from '../lib/store.js';
import { page, pageHead, tag, levelTag, chips, lazyBoard } from './common.js';

const FILTER_KEY = 'chess-academy-opening-filter';
const loadFilter = () => { try { return { q: '', side: 'all', style: 'all', level: 'all', ...JSON.parse(sessionStorage.getItem(FILTER_KEY) || '{}') }; } catch { return { q: '', side: 'all', style: 'all', level: 'all' }; } };
const saveFilter = (f) => { try { sessionStorage.setItem(FILTER_KEY, JSON.stringify(f)); } catch { /* ignore */ } };

export function render(data) {
  const f = loadFilter();
  const grid = h('div.opening-grid');
  const count = h('p.result-count', { 'aria-live': 'polite' });

  const matches = (o) => {
    const q = f.q.trim().toLowerCase();
    const hay = [o.name, o.eco, o.summary, ...o.variations.map((v) => v.name)].join(' ').toLowerCase();
    return (!q || hay.includes(q)) && (f.side === 'all' || o.side === f.side) &&
      (f.style === 'all' || o.styles.includes(f.style)) && (f.level === 'all' || o.difficulty === f.level);
  };
  const paint = () => {
    saveFilter(f);
    const list = data.openings.filter(matches);
    count.textContent = list.length === data.openings.length ? `All ${list.length} openings` : `${list.length} of ${data.openings.length} openings`;
    grid.replaceChildren(...list.map(card));
    if (!list.length) grid.append(h('div.empty', h('p', 'No opening matches those filters.'), h('button.btn', { type: 'button', onclick: () => { Object.assign(f, { q: '', side: 'all', style: 'all', level: 'all' }); saveFilter(f); location.reload(); } }, 'Clear filters')));
  };
  const search = h('input.search-input', { type: 'search', placeholder: 'Search openings or variations (e.g. Najdorf, Marshall)', value: f.q, 'aria-label': 'Search openings', oninput: (e) => { f.q = e.target.value; paint(); } });

  const card = (o) => h('a.opening-card', { href: `#/openings/${o.id}` },
    lazyBoard({ moves: o.mainLine }, { orientation: o.side, label: `${o.name} after the main line` }),
    h('div.opening-card-body',
      h('h2.opening-name', o.name, isSeen('opening', o.id) ? h('span.seen', { title: 'Studied' }, icon('check', 16)) : null),
      h('p.opening-moves', lineText(o.mainLine.slice(0, 6))),
      h('p.opening-summary', o.summary),
      h('div.tags', tag(o.side === 'white' ? 'White' : 'Black', 'side-' + o.side), ...o.styles.map((s) => tag(cap(s))), levelTag(o.difficulty), tag(`${o.variations.length} variations`, 'quiet'))));

  const filters = h('div.filters',
    h('label.search', icon('search', 18), search),
    h('div.filter-row',
      h('span.filter-label', 'Colour'), chips('Colour', [['all', 'Both'], ['white', 'White'], ['black', 'Black']], f.side, (v) => { f.side = v; paint(); })),
    h('div.filter-row',
      h('span.filter-label', 'Style'), chips('Style', [['all', 'Any'], ['aggressive', 'Aggressive'], ['solid', 'Solid'], ['positional', 'Positional']], f.style, (v) => { f.style = v; paint(); })),
    h('div.filter-row',
      h('span.filter-label', 'Level'), chips('Level', [['all', 'Any'], ['beginner', 'Beginner'], ['intermediate', 'Intermediate'], ['advanced', 'Advanced']], f.level, (v) => { f.level = v; paint(); })));

  paint();
  return page('Openings', pageHead('Openings', 'Each opening comes with the reason it exists, an annotated main line, its named variations, the traps to know and the best replies.'), filters, count, grid);
}

export function renderDetail(data, id) {
  const o = data.openings.find((x) => x.id === id);
  if (!o) return page('Not found', h('h1', 'Unknown opening'), h('p', h('a', { href: '#/openings' }, 'See all openings')));
  markSeen('opening', o.id);
  const idx = data.openings.indexOf(o);
  const prev = data.openings[(idx - 1 + data.openings.length) % data.openings.length];
  const next = data.openings[(idx + 1) % data.openings.length];

  const boardCol = h('div.study-board');
  const viewer = new LineViewer(boardCol, { orientation: o.side, label: `${o.name} board` });
  const nowPlaying = h('p.now-playing');
  boardCol.prepend(nowPlaying);
  let activeItem = null;
  const play = (title, moves, intro, itemEl, outro) => {
    nowPlaying.replaceChildren(h('span.muted', 'On the board: '), h('strong', title));
    viewer.load({ moves, intro, outro, orientation: o.side });
    activeItem?.classList.remove('active');
    activeItem = itemEl || null;
    activeItem?.classList.add('active');
    if (matchMedia('(max-width: 900px)').matches) boardCol.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  // --- tab panels
  const lineItem = (title, moves, body, extra, intro, outro) => {
    const el = h('article.line-item', { tabindex: 0 },
      h('div.line-item-head', h('h3', title), extra),
      h('p.line-moves', lineText(moves)),
      body ? h('p', body) : null,
      h('button.btn.btn-small', { type: 'button', onclick: (e) => { e.stopPropagation(); play(title, moves, intro, el, outro); } }, icon('play', 16), 'Play on board'));
    el.addEventListener('click', (e) => { if (!e.target.closest('button')) play(title, moves, intro, el, outro); });
    el.addEventListener('keydown', (e) => { if (e.key === 'Enter') play(title, moves, intro, el, outro); });
    return el;
  };

  const overview = h('div.tab-panel',
    h('p.mnemonic', o.mnemonic),
    h('h3', 'What it aims for'), h('p', o.purpose),
    h('div.two-col',
      h('div', h('h3', 'Ideas for White'), h('ul.ticks', o.ideas.white.map((t) => h('li', t)))),
      h('div', h('h3', 'Ideas for Black'), h('ul.ticks', o.ideas.black.map((t) => h('li', t))))),
    h('h3', 'Typical plans'), h('ul', o.plans.map((t) => h('li', t))),
    h('h3', 'Common mistakes'), h('ul.crosses', o.mistakes.map((t) => h('li', t))),
    h('button.btn', { type: 'button', onclick: () => play('Main line', o.mainLine, o.purpose) }, icon('play', 16), 'Replay the main line'));

  let level = 'all';
  const varList = h('div.line-list');
  const paintVars = () => varList.replaceChildren(...o.variations.filter((v) => level === 'all' || v.level === level)
    .map((v) => lineItem(v.name, v.moves, v.idea, levelTag(v.level), v.idea, v.idea)));
  paintVars();
  const levels = ['beginner', 'intermediate', 'advanced'].filter((l) => o.variations.some((v) => v.level === l));
  const variations = h('div.tab-panel',
    h('div.panel-tools', chips('Variation level', [['all', `All ${o.variations.length}`], ...levels.map((l) => [l, cap(l)])], 'all', (v) => { level = v; paintVars(); })),
    varList);

  const traps = h('div.tab-panel', h('div.line-list', o.traps.map((t) =>
    lineItem(t.name, t.moves, t.explanation, tag(t.side === o.side ? 'For you' : 'Against you', t.side === o.side ? 'good' : 'warn'), 'Watch for the moment the trap is sprung.', t.explanation))));

  const counters = h('div.tab-panel',
    h('p.muted', o.side === 'white' ? `How Black can meet the ${o.name}, and why each reply works.` : `How White can meet the ${o.name}, and why each system works.`),
    h('div.line-list', o.counters.map((c) => lineItem(c.name, c.moves, c.why, null, c.why, c.why))));

  const advanced = h('div.tab-panel',
    h('p.muted', 'Deeper ideas for stronger players: move orders, structures and typical sacrifices.'),
    h('div.line-list', o.advanced.map((a) => a.moves
      ? lineItem(a.title, a.moves, a.text, levelTag('advanced'), a.text, a.text)
      : h('article.line-item.line-item-text', h('div.line-item-head', h('h3', a.title), levelTag('advanced')), h('p', a.text)))));

  const tabs = [
    ['overview', 'Overview', overview],
    ['variations', `Variations (${o.variations.length})`, variations],
    ['traps', `Traps (${o.traps.length})`, traps],
    ['counters', o.side === 'white' ? 'Black\'s replies' : 'White\'s replies', counters],
    ['advanced', 'Advanced', advanced],
  ];
  const tabBar = h('div.tabs', { role: 'tablist', 'aria-label': `${o.name} sections` });
  const panelWrap = h('div.tab-panels');
  const showTab = (key) => {
    tabs.forEach(([k, , panel]) => { panel.hidden = k !== key; });
    [...tabBar.children].forEach((b) => { const on = b.dataset.k === key; b.classList.toggle('on', on); b.setAttribute('aria-selected', on); b.tabIndex = on ? 0 : -1; });
    try { sessionStorage.setItem('chess-academy-tab-' + o.id, key); } catch { /* ignore */ }
  };
  tabs.forEach(([k, label, panel]) => {
    panel.setAttribute('role', 'tabpanel');
    tabBar.append(h('button.tab', { type: 'button', role: 'tab', 'data-k': k, onclick: () => showTab(k) }, label));
    panelWrap.append(panel);
  });
  tabBar.addEventListener('keydown', (e) => {
    if (!['ArrowLeft', 'ArrowRight'].includes(e.key)) return;
    const keys = tabs.map((t) => t[0]);
    const cur = keys.indexOf(tabBar.querySelector('.on').dataset.k);
    const nk = keys[(cur + (e.key === 'ArrowRight' ? 1 : keys.length - 1)) % keys.length];
    showTab(nk); tabBar.querySelector(`[data-k="${nk}"]`).focus();
    e.stopPropagation();
  });
  let startTab = 'overview';
  try { startTab = sessionStorage.getItem('chess-academy-tab-' + o.id) || 'overview'; } catch { /* ignore */ }
  showTab(tabs.some((t) => t[0] === startTab) ? startTab : 'overview');

  play('Main line', o.mainLine, o.purpose);

  return page(o.name,
    h('nav.crumbs', { 'aria-label': 'Breadcrumb' }, h('a', { href: '#/openings' }, 'Openings'), h('span', o.name)),
    h('header.study-head',
      h('h1', o.name),
      h('p.study-sub', `${o.eco}. ${o.summary}`),
      h('div.tags', tag(o.side === 'white' ? 'White' : 'Black', 'side-' + o.side), ...o.styles.map((s) => tag(cap(s))), levelTag(o.difficulty))),
    h('div.study', boardCol, h('div.study-text', tabBar, panelWrap)),
    h('nav.pager', h('a', { href: `#/openings/${prev.id}` }, '← ' + prev.name), h('a', { href: `#/openings/${next.id}` }, next.name + ' →')));
}
