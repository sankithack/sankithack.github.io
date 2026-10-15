// Review your own game: paste a PGN, step through it, see checks/captures and quick blunder flags.
import { h, icon } from '../lib/dom.js';
import { LineViewer } from '../lib/viewer.js';
import { Chess } from '../lib/line.js';
import { parsePgn, forcingMoves } from '../lib/review.js';
import { page, pageHead, chips } from './common.js';

const KEY = 'chess-academy-pgn';
const EXAMPLES = {
  'Scholar\'s mate blunder': '[White "You"]\n[Black "Opponent"]\n\n1. e4 e5 2. Bc4 Nc6 3. Qh5 Nf6 4. Qxf7# 1-0',
  'The Opera Game': '[White "Paul Morphy"]\n[Black "Duke Karl / Count Isouard"]\n[Event "Paris Opera"]\n[Date "1858.??.??"]\n\n1. e4 e5 2. Nf3 d6 3. d4 Bg4 4. dxe5 Bxf3 5. Qxf3 dxe5 6. Bc4 Nf6 7. Qb3 Qe7 8. Nc3 c6 9. Bg5 b5 10. Nxb5 cxb5 11. Bxb5+ Nbd7 12. O-O-O Rd8 13. Rxd7 Rxd7 14. Rd1 Qe6 15. Bxd7+ Nxd7 16. Qb8+ Nxb8 17. Rd8# 1-0',
  'Légal\'s mate': '[White "Légal"]\n[Black "Saint Brie"]\n\n1. e4 e5 2. Nf3 d6 3. Bc4 Bg4 4. Nc3 g6 5. Nxe5 Bxd1 6. Bxf7+ Ke7 7. Nd5# 1-0',
};
const KIND = {
  'allowed-mate': ['bad', 'Allows mate'], hanging: ['bad', 'Loose material'], sacrifice: ['warn', 'Sacrifice?'], 'sound-sacrifice': ['good', 'Sacrifice'],
  'missed-mate': ['warn', 'Missed mate'], 'missed-win': ['warn', 'Missed win'],
};

export function render() {
  let saved = '';
  try { saved = localStorage.getItem(KEY) || ''; } catch { /* ignore */ }
  const area = h('textarea.pgn-input', { rows: 7, spellcheck: false, placeholder: 'Paste a PGN here — export it from Lichess or Chess.com ("Share" → "PGN").', 'aria-label': 'PGN of your game' });
  area.value = saved;
  const error = h('p.form-error', { role: 'alert' });
  const out = h('div.review-out');
  let cct = false, viewer, game;

  let worker;
  function load() {
    error.textContent = '';
    try { game = parsePgn(area.value); } catch (e) { error.textContent = e.message; return; }
    try { localStorage.setItem(KEY, area.value); } catch { /* ignore */ }
    out.replaceChildren(h('p.analysing', icon('search', 18), `Analysing ${game.sans.length} moves…`));
    worker?.terminate();
    worker = new Worker(new URL('../lib/review-worker.js', import.meta.url), { type: 'module' });
    worker.onmessage = ({ data }) => { worker.terminate(); worker = null; data.ok ? show(data.review) : (error.textContent = 'Analysis failed: ' + data.error, out.replaceChildren()); };
    worker.postMessage({ startFen: game.startFen, sans: game.sans });
  }
  function show(review) {
    if (!out.isConnected) return;
    const moves = review.map((r) => {
      const f = r.flags[0];
      return { san: r.san, note: r.flags.map((x) => x.text).join(' ') || null,
        arrows: f ? [(f.kind.startsWith('missed') ? '~' : '!') + f.move.from + f.move.to] : undefined };
    });
    out.replaceChildren();
    const boardCol = h('div.study-board');
    viewer = new LineViewer(boardCol, { label: 'Your game', onStep: (i, fr) => overlay(i, fr) });
    viewer.load({ fen: game.startFen, moves, intro: `${game.headers.White || 'White'} vs ${game.headers.Black || 'Black'}${game.headers.Result ? ', ' + game.headers.Result : ''}. Step through with → or swipe.` });
    // mark flagged moves on the scoresheet
    review.forEach((r, i) => { const cell = viewer.cells[i + 1]; if (cell && r.flags.length) cell.classList.add('flag-' + KIND[r.flags[0].kind][0]); });
    const moments = review.map((r, i) => ({ ...r, i })).filter((r) => r.flags.length);
    const num = (i) => `${Math.floor(i / 2) + 1}${review[i].color === 'w' ? '.' : '…'}`;
    out.append(h('div.study', boardCol,
      h('div.study-text',
        h('div.panel-tools', chips('Overlay', [['off', 'Coach notes'], ['on', 'Show all checks & captures']], cct ? 'on' : 'off', (v) => { cct = v === 'on'; viewer.show(viewer.i, false); })),
        h('h2', moments.length ? `${moments.length} moment${moments.length > 1 ? 's' : ''} to look at` : 'No obvious blunders found'),
        h('p.muted.small', 'This is a quick one-move check, not an engine: it finds mates in one and pieces that can be taken for free. Deeper mistakes need your own analysis — use the thinking routine on each critical moment.'),
        h('ol.moments', moments.map((m) => h('li', h('button.moment.moment-' + KIND[m.flags[0].kind][0], { type: 'button', onclick: () => { viewer.stop(); viewer.show(m.i + 1); } },
          h('span.moment-move', `${num(m.i)}${m.san}`), h('span.tag', KIND[m.flags[0].kind][1]), h('span', m.flags[0].text))))))));
  }
  function overlay(i, fr) {
    if (!cct || !viewer) return;
    const c = new Chess(fr.fen);
    viewer.board.setArrows(forcingMoves(c).map((m) => ({ from: m.from, to: m.to, kind: /[+#]/.test(m.san) ? 'threat' : 'alt' })));
  }

  if (saved) setTimeout(load, 0);
  return page('Review a game',
    h('nav.crumbs', h('a', { href: '#/practice' }, 'Practice'), h('span', 'Review a game')),
    pageHead('Review your game', 'Paste a game you played. Step through it on the board, see every check and capture available at each move, and jump to the moments where a piece was left loose or a mate was missed.'),
    h('div.pgn-box', area,
      h('div.puzzle-actions',
        h('button.btn.btn-primary', { type: 'button', onclick: load }, icon('play', 16), 'Review this game'),
        h('span.muted.small', 'Examples:'),
        Object.entries(EXAMPLES).map(([name, pgn]) => h('button.btn.btn-small', { type: 'button', onclick: () => { area.value = pgn; load(); } }, name))),
      error),
    out);
}
