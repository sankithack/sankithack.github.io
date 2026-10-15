import { h, icon } from '../lib/dom.js';
import { LineViewer } from '../lib/viewer.js';
import { markSeen, isSeen } from '../lib/store.js';
import { page, pageHead, lazyBoard } from './common.js';

const groups = (list) => [...new Set(list.map((e) => e.group))].map((g) => [g, list.filter((e) => e.group === g)]);
const RESULT = { win: 'wins', loss: 'loses', draw: 'draws' };

export function render(data) {
  return page('Endgames',
    pageHead('Endgames', 'Fewer pieces, deeper ideas. Learn the basic mates, the principles that decide king-and-pawn endings, and the rook positions every player needs.'),
    groups(data.endgames).map(([g, items]) => h('section.eg-group',
      h('h2', g),
      h('div.eg-grid', items.map((e) => h('a.eg-card', { href: `#/endgames/${e.id}` },
        lazyBoard({ fen: e.lines[0].fen }, { label: e.name }),
        h('div.eg-card-body', h('h3', e.name, isSeen('endgame', e.id) ? h('span.seen', icon('check', 16)) : null), h('p.mnemonic-sm', e.mnemonic))))))));
}

export function renderDetail(data, id) {
  const e = data.endgames.find((x) => x.id === id);
  if (!e) return page('Not found', h('h1', 'Unknown endgame'), h('p', h('a', { href: '#/endgames' }, 'See all endgames')));
  markSeen('endgame', e.id);
  const idx = data.endgames.indexOf(e);
  const prev = data.endgames[(idx - 1 + data.endgames.length) % data.endgames.length];
  const next = data.endgames[(idx + 1) % data.endgames.length];

  const boardCol = h('div.study-board');
  const viewer = new LineViewer(boardCol, { label: `${e.name} board` });
  const verdict = h('p.verdict');
  const lineTabs = h('div.chips', { role: 'tablist', 'aria-label': 'Example lines' });
  const load = (l, i) => {
    [...lineTabs.children].forEach((b, j) => { b.classList.toggle('on', i === j); b.setAttribute('aria-selected', i === j); });
    const stm = l.fen.split(' ')[1] === 'w' ? 'White' : 'Black';
    verdict.replaceChildren(l.expect
      ? h('span', icon('check', 16), `Computer-verified: with ${stm} to move, ${stm} ${RESULT[l.expect]}.`)
      : h('span', `${stm} to move.`));
    viewer.load({ fen: l.fen, moves: l.moves, intro: e.summary });
  };
  e.lines.forEach((l, i) => lineTabs.append(h('button.chip', { type: 'button', role: 'tab', onclick: () => load(l, i) }, l.title || `Line ${i + 1}`)));
  load(e.lines[0], 0);

  return page(e.name,
    h('nav.crumbs', { 'aria-label': 'Breadcrumb' }, h('a', { href: '#/endgames' }, 'Endgames'), h('span', e.group)),
    h('header.study-head', h('h1', e.name), h('p.mnemonic', e.mnemonic)),
    h('div.study', boardCol,
      h('div.study-text',
        e.lines.length > 1 ? lineTabs : null, verdict,
        h('p', e.summary),
        h('h3', 'How to play it'),
        h('ol.steps', e.points.map((p) => h('li', p))),
        h('a.btn.btn-primary', { href: `#/practice/endgame/${e.id}` }, icon('target', 16), e.practice?.mode === 'drill' ? 'Practise the line' : 'Play it against the computer'))),
    h('nav.pager', h('a', { href: `#/endgames/${prev.id}` }, '← ' + prev.name), h('a', { href: `#/endgames/${next.id}` }, next.name + ' →')));
}
