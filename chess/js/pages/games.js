// Classic games: watch them annotated, or guess the winner's moves.
import { h, icon } from '../lib/dom.js';
import { LineViewer } from '../lib/viewer.js';
import { LineDrill } from '../lib/drill.js';
import { saveBest, best } from '../lib/store.js';
import { page, pageHead, tag, lazyBoard } from './common.js';

export function render(data, id, mode) {
  if (id) return detail(data, id, mode);
  return page('Classic games',
    pageHead('Classic games', 'Short, famous games where every move teaches something. Watch them with notes, then play the winner\'s side and guess each move.'),
    h('div.games-grid', data.games.map((g) => h('a.game-card', { href: `#/games/${g.id}` },
      lazyBoard({ moves: g.moves }, { label: `${g.title}, final position` }),
      h('div.game-card-body',
        h('h2', g.title), h('p.muted.small', `${g.players}. ${g.event}.`),
        h('p.game-lesson', g.lesson),
        h('div.tags', (g.themes || []).map((t) => tag(t, 'quiet')), best('guess:' + g.id) ? tag(`Best guess ${best('guess:' + g.id)}%`, 'good') : null))))));
}

function detail(data, id, mode = 'watch') {
  const g = data.games.find((x) => x.id === id);
  if (!g) return page('Not found', h('h1', 'Unknown game'), h('p', h('a', { href: '#/games' }, 'All games')));
  const idx = data.games.indexOf(g), next = data.games[(idx + 1) % data.games.length];
  const col = h('div.study-board');
  const result = h('div.drill-result');
  const side = g.side || 'w';
  const sideName = side === 'w' ? 'White' : 'Black';
  if (mode === 'guess') {
    new LineDrill(col, { moves: g.moves, side, revealAfter: 2, intro: `You are ${sideName} (${g.players.split(' vs ')[side === 'w' ? 0 : 1]}). Guess each move — after two wrong tries the game move is shown.`,
      onDone: (r) => {
        const pct = Math.round((r.firstTry / Math.max(1, r.userMoves)) * 100);
        const record = saveBest('guess:' + g.id, pct);
        result.replaceChildren(h('p', h('strong', `${r.firstTry} of ${r.userMoves} moves guessed first time (${pct}%).`), record ? ' New best!' : ''), h('p.muted', 'Masters score well because they recognise the ideas: development, open lines, sacrifices on the king. Watch the game again and try once more.'),
          h('a.btn.btn-primary', { href: `#/games/${g.id}` }, 'Watch with notes'));
      } });
  } else {
    const v = new LineViewer(col, { label: g.title });
    v.load({ moves: g.moves, intro: g.lesson });
  }
  return page(g.title,
    h('nav.crumbs', h('a', { href: '#/games' }, 'Classic games'), h('span', g.title)),
    h('header.study-head', h('h1', g.title), h('p.study-sub', `${g.players}. ${g.event}.`), h('div.tags', (g.themes || []).map((t) => tag(t, 'quiet')))),
    h('div.study', col,
      h('div.study-text',
        h('div.chips', { role: 'tablist', 'aria-label': 'Mode' },
          h('a.chip' + (mode !== 'guess' ? '.on' : ''), { href: `#/games/${g.id}` }, icon('play', 14), ' Watch with notes'),
          h('a.chip' + (mode === 'guess' ? '.on' : ''), { href: `#/games/${g.id}/guess` }, icon('target', 14), ` Guess ${sideName}'s moves`)),
        h('p.mnemonic', g.lesson), result,
        best('guess:' + g.id) ? h('p.muted', `Your best guess score: ${best('guess:' + g.id)}%.`) : null,
        h('a.btn', { href: `#/games/${next.id}` }, 'Next game: ' + next.title))));
}
