import { h, icon } from '../lib/dom.js';
import { markSeen, isSeen } from '../lib/store.js';
import { page, pageHead, staticBoard } from './common.js';

export function render(data, id) {
  const s = data.strategy.find((x) => x.id === id) || data.strategy[0];
  markSeen('strategy', s.id);
  const boardBox = h('div.study-board-inner');
  staticBoard(boardBox, s, { size: 'md', coords: true, label: `${s.name} example position`, lastMove: true });
  const idx = data.strategy.indexOf(s);
  const next = data.strategy[(idx + 1) % data.strategy.length];

  return page(s.name,
    pageHead('Middlegame strategy', 'Tactics win material; strategy tells you where to put your pieces when there is no tactic. Each idea comes with an example position: green arrows are plans, red arrows are threats, blue arrows are alternatives.'),
    h('nav.concept-nav', { 'aria-label': 'Strategic concepts' },
      data.strategy.map((c) => h('a.concept-link' + (c.id === s.id ? '.active' : ''), { href: `#/strategy/${c.id}`, 'aria-current': c.id === s.id ? 'page' : null },
        c.name, isSeen('strategy', c.id) && c.id !== s.id ? icon('check', 14) : null))),
    h('div.study',
      h('div.study-board', boardBox, h('p.legend', h('span.key.key-plan', 'Plan'), h('span.key.key-threat', 'Threat'), h('span.key.key-alt', 'Alternative'), h('span.key.key-sq', 'Key square'))),
      h('article.study-text',
        h('h2.concept-title', s.name),
        h('p.mnemonic', s.mnemonic),
        h('p.concept-summary', s.summary),
        h('h3', 'What the position shows'),
        h('ul.points', s.points.map((p) => h('li', p))),
        h('a.btn', { href: `#/strategy/${next.id}` }, 'Next idea: ' + next.name))));
}
