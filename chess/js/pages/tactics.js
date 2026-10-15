import { h, icon } from '../lib/dom.js';
import { buildLine } from '../lib/line.js';
import { createPuzzle, allPuzzles } from '../lib/puzzle.js';
import { markSolved, isSolved } from '../lib/store.js';
import { page, pageHead, tag, lazyBoard, levelTag, chips } from './common.js';


export function render(data) {
  const solved = data.tactics.filter((t) => isSolved(t.id)).length;
  let level = 'all';
  const wrap = h('div');
  const card = (t) => h('a.tactic-card', { href: `#/tactics/${t.id}` },
    lazyBoard({ fen: t.fen, setup: t.setup }, { orientation: toMove(t) === 'w' ? 'white' : 'black', label: `${t.name} puzzle` }),
    h('div.tactic-card-body',
      h('h2', t.name, isSolved(t.id) ? h('span.seen', { title: 'Solved' }, icon('check', 16)) : null),
      h('p.mnemonic-sm', t.mnemonic),
      h('div.tags', levelTag(t.level), tag(t.goal, t.goal === 'Checkmate' ? 'warn' : 'quiet'), t.extra ? tag(`${t.extra.length + 1} puzzles`, 'quiet') : null)));
  const paint = () => wrap.replaceChildren(...[...new Set(data.tactics.map((t) => t.group))].map((g) => {
    const list = data.tactics.filter((t) => t.group === g && (level === 'all' || t.level === level));
    return list.length ? h('section.eg-group', h('h2', g), h('div.tactic-grid', list.map(card))) : null;
  }).filter(Boolean));
  paint();
  return page('Tactics',
    pageHead('Tactics', `${data.tactics.length} motifs and mating patterns that win games. Each has a definition, a memory hook and a position to solve yourself — drag, tap or type your move.`,
      h('p.muted', `${solved} of ${data.tactics.length} solved`)),
    h('div.panel-tools', chips('Level', [['all', 'All levels'], ['beginner', 'Beginner'], ['intermediate', 'Intermediate'], ['advanced', 'Advanced']], level, (v) => { level = v; paint(); }),
      h('a.btn.btn-primary', { href: '#/practice/rush' }, icon('bolt', 16), 'Puzzle rush')),
    wrap);
}

function toMove(t) { return buildLine({ fen: t.fen, setup: t.setup })[0].fen.split(' ')[1]; }

export function renderDetail(data, id, n = '1') {
  const t = data.tactics.find((x) => x.id === id);
  if (!t) return page('Not found', h('h1', 'Unknown tactic'), h('p', h('a', { href: '#/tactics' }, 'See all tactics')));
  const idx = data.tactics.indexOf(t);
  const next = data.tactics[(idx + 1) % data.tactics.length];
  const prev = data.tactics[(idx - 1 + data.tactics.length) % data.tactics.length];

  const positions = allPuzzles([t]);
  const k = Math.min(positions.length, Math.max(1, Number(n) || 1)) - 1;
  const pz = positions[k];
  const nextHref = k + 1 < positions.length ? `#/tactics/${t.id}/${k + 2}` : `#/tactics/${next.id}`;
  const reveal = h('div.puzzle-reveal', { hidden: true },
    h('h3', 'Why it works'), h('p', pz.explanation),
    h('a.btn.btn-primary', { href: nextHref }, k + 1 < positions.length ? `Next ${t.name.toLowerCase()} puzzle` : 'Next: ' + next.name));
  const puzzle = createPuzzle(pz, { onSolved: () => { markSolved(pz.pid); markSolved(t.id); reveal.hidden = false; } });
  const switcher = positions.length > 1 ? h('div.chips.puzzle-switch', { role: 'tablist', 'aria-label': 'Puzzles for this motif' },
    positions.map((p, i) => h('a.chip' + (i === k ? '.on' : ''), { href: `#/tactics/${t.id}/${i + 1}`, 'aria-current': i === k ? 'page' : null }, isSolved(p.pid) ? '✓ ' : '', `Puzzle ${i + 1}`))) : null;
  return page(t.name,
    h('nav.crumbs', { 'aria-label': 'Breadcrumb' }, h('a', { href: '#/tactics' }, 'Tactics'), h('span', t.name)),
    h('div.study.study-puzzle',
      h('div.study-board', puzzle.el),
      h('div.study-text',
        h('header.study-head', h('h1', t.name), h('div.tags', levelTag(t.level), tag(t.group, 'quiet')), h('p.mnemonic', t.mnemonic)),
        switcher,
        h('h3', 'Definition'), h('p', t.definition),
        h('p.muted', 'Drag a piece, tap it and then its destination, or type the move below the board.'),
        reveal)),
    h('nav.pager', h('a', { href: `#/tactics/${prev.id}` }, '← ' + prev.name), h('a', { href: `#/tactics/${next.id}` }, next.name + ' →')));
}
