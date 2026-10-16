// Site search: a command palette over every lesson, line and page.
import { h, icon } from './dom.js';
import { normMove } from './line.js';

const fold = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const bare = (san) => san.replace(/[+#!?]/g, '');
const SAN = /^(O-O(-O)?|[KQRBN]?[a-h]?[1-8]?x?[a-h][1-8](=[QRBN])?)$/;

/** Build a flat index: [{ title, sub, kind, href, text, line? }] */
export function buildIndex(data) {
  const ix = [];
  const add = (kind, title, sub, href, text = '', line) => ix.push({ kind, title, sub, href, text: fold(`${title} ${sub} ${text}`), ftitle: fold(title), line });
  const seq = (moves) => moves.map((m) => bare(normMove(m).san)).join(' ') + ' ';
  for (const o of data.openings) {
    add('Opening', o.name, `${o.eco} · ${o.side === 'white' ? 'White' : 'Black'}`, `#/openings/${o.id}`, `${o.summary} ${o.mnemonic} ${o.variations.map((v) => v.name).join(' ')}`, seq(o.mainLine));
    o.variations.forEach((v) => add('Variation', v.name, o.name, `#/openings/${o.id}/variations`, v.idea, seq(v.moves)));
    o.traps.forEach((t) => add('Trap', t.name, o.name, `#/openings/${o.id}/traps`, t.explanation, seq(t.moves)));
    o.counters.forEach((c) => add('How to beat it', c.name, o.name, `#/openings/${o.id}/counters`, c.why, seq(c.moves)));
  }
  data.tactics.forEach((t) => add('Tactic', t.name, t.group, `#/tactics/${t.id}`, `${t.definition} ${t.mnemonic}`));
  data.strategy.forEach((s) => add('Strategy', s.name, 'Middlegame plan', `#/strategy/${s.id}`, `${s.summary} ${s.mnemonic}`));
  data.endgames.forEach((e) => add('Endgame', e.name, e.group, `#/endgames/${e.id}`, `${e.summary} ${e.mnemonic}`));
  (data.games || []).forEach((g) => add('Game', g.title, g.players, `#/games/${g.id}`, `${g.lesson} ${g.event} ${(g.themes || []).join(' ')}`));
  data.attack.forEach((a) => add('Attack', a.name, 'Attacking lesson', `#/guide/attack/${a.id}`, `${a.principle} ${a.mnemonic}`));
  [
    ['Guide', 'Roadmap: 500 → 2000+', 'Study plan', '#/guide', 'rating plan improve beginner'],
    ['Guide', 'How to think during a game', 'Candidate moves, calculation', '#/guide/think', 'candidate moves calculate blunder check thinking process'],
    ['Guide', 'How to remember positions', 'Memory techniques', '#/guide/memory', 'memory chunking visualization'],
    ['Guide', 'How to attack', 'Attacking chess', '#/guide/attack', 'attack king sacrifice'],
    ['Practice', 'Opening drills', 'Practice', '#/practice/openings', 'drill repertoire memorize'],
    ['Practice', 'Puzzle rush', 'Practice', '#/practice/rush', 'tactics timer'],
    ['Practice', 'Candidate moves', 'Practice', '#/practice/candidates', 'checks captures threats cct'],
    ['Practice', 'Calculate 3+ moves', 'Practice', '#/practice/calculate', 'calculation visualize'],
    ['Practice', 'Find the square', 'Strategy practice', '#/practice/strategy', 'outpost weak square'],
    ['Practice', 'Endgames vs computer', 'Practice', '#/practice/endgame/kq-vs-k', 'mate endgame play'],
    ['Practice', 'Position memory', 'Practice', '#/practice/memory', 'memory'],
    ['Practice', 'Follow the moves', 'Practice', '#/practice/visualize', 'blindfold visualization'],
    ['Practice', 'Square colours', 'Practice', '#/practice/colors', 'light dark blindfold'],
    ['Practice', 'Review a game', 'Paste a PGN', '#/review', 'pgn analyse analysis blunder'],
    ['Settings', 'Your progress', 'Back up, restore, reset', '#/progress', 'backup export import restore reset device sync'],
    ['Trainer', 'Square trainer', 'Board coordinates', '#/train/squares', 'coordinates notation'],
    ['Trainer', 'Quiz', 'Openings, tactics, endgames', '#/train/quiz', 'test'],
    ['Trainer', 'Flashcards', 'Memory hooks', '#/train/cards', 'spaced repetition'],
  ].forEach(([k, t, s, href, text]) => add(k, t, s, href, text));
  return ix;
}

/** Score entries for a query; supports move sequences like "1.e4 c5 2.Nf3". */
export function search(ix, q, limit = 12) {
  const raw = q.trim();
  if (!raw) return [];
  const toks = raw.replace(/0-0-0/g, 'O-O-O').replace(/0-0/g, 'O-O').replace(/\d+\.(\.\.)?/g, ' ').trim().split(/\s+/).map(bare).filter(Boolean);
  const moveQ = toks.length && toks.every((t) => SAN.test(t)) ? toks.join(' ') + ' ' : null;
  const words = fold(raw).split(/\s+/).filter(Boolean);
  const scored = [];
  for (const e of ix) {
    let score = 0;
    if (moveQ && e.line?.startsWith(moveQ)) score = 50 + (e.kind === 'Opening' ? 20 : 0) - e.line.length / 100;
    else if (words.every((w) => e.text.includes(w))) {
      score = 10;
      if (e.ftitle.startsWith(words.join(' '))) score += 30;
      if (words.every((w) => e.ftitle.includes(w))) score += 15;
      if (e.kind === 'Opening' || e.kind === 'Tactic' || e.kind === 'Strategy' || e.kind === 'Endgame') score += 3;
    }
    if (score) scored.push({ e, score });
  }
  return scored.sort((a, b) => b.score - a.score).slice(0, limit).map((s) => s.e);
}

// ---------------------------------------------------------------- palette UI
let ix = null, palette, input, list, sel = 0, results = [];
export function initSearch(data) {
  ix = buildIndex(data);
  input = h('input.palette-input', { type: 'search', placeholder: 'Search openings, variations, tactics… or moves like 1.e4 c5', 'aria-label': 'Search the site', autocomplete: 'off', spellcheck: false });
  list = h('ul.palette-list', { role: 'listbox', id: 'palette-list' });
  input.setAttribute('aria-controls', 'palette-list');
  palette = h('div.palette', { hidden: true, role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Search' },
    h('div.palette-backdrop', { onclick: closeSearch }),
    h('div.palette-box', h('label.palette-field', icon('search', 20), input, h('kbd.palette-esc', 'Esc')), list,
      h('p.palette-hint', '↑ ↓ to choose · Enter to open · try "fork", "najdorf", "opposition", "1.d4 Nf6 2.c4 g6"')));
  document.body.append(palette);
  input.addEventListener('input', () => { sel = 0; paint(); });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); sel = Math.min(results.length - 1, sel + 1); paint(false); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); sel = Math.max(0, sel - 1); paint(false); }
    else if (e.key === 'Enter' && results[sel]) { e.preventDefault(); go(results[sel]); }
  });
  document.addEventListener('keydown', (e) => {
    const typing = e.target.closest?.('input, textarea, select, [contenteditable]');
    if ((e.key === 'k' && (e.metaKey || e.ctrlKey)) || (e.key === '/' && !typing)) { e.preventDefault(); openSearch(); }
    else if (e.key === 'Escape' && !palette.hidden) closeSearch();
  });
}
export function openSearch() {
  if (!palette) return;
  palette.hidden = false;
  document.body.classList.add('sheet-open');
  input.value = ''; results = []; sel = 0; paint();
  setTimeout(() => input.focus(), 0);
}
export function closeSearch() { if (!palette) return; palette.hidden = true; document.body.classList.remove('sheet-open'); }
function go(e) { closeSearch(); location.hash = e.href; }
function paint(recompute = true) {
  if (recompute) results = search(ix, input.value);
  list.replaceChildren(...(input.value.trim() && !results.length ? [h('li.palette-empty', 'No matches. Try a shorter word, an ECO code, or a move sequence.')] : []),
    ...results.map((r, i) => h('li', { role: 'option', 'aria-selected': String(i === sel) },
      h('a.palette-item' + (i === sel ? '.on' : ''), { href: r.href, onclick: (e) => { e.preventDefault(); go(r); }, onmousemove: () => { if (sel !== i) { sel = i; paint(false); } } },
        h('span.palette-kind', r.kind), h('span.palette-title', r.title), h('span.palette-sub', r.sub)))));
  list.querySelector('.on')?.scrollIntoView({ block: 'nearest' });
}
