import { h, icon } from '../lib/dom.js';
import { Board } from '../lib/board.js';
import { Chess, buildLine, parseArrow } from '../lib/line.js';
import { kingSquare } from '../lib/viewer.js';
import { markSolved, isSolved } from '../lib/store.js';
import { page, pageHead, tag, lazyBoard } from './common.js';

const strip = (san) => san.replace(/[+#?!]/g, '');

export function render(data) {
  const solved = data.tactics.filter((t) => isSolved(t.id)).length;
  return page('Tactics',
    pageHead('Tactics', 'Fourteen motifs that win games. Each one has a definition, a memory hook and a position to solve yourself — move the pieces on the board.',
      h('p.muted', `${solved} of ${data.tactics.length} solved`)),
    h('div.tactic-grid', data.tactics.map((t) => h('a.tactic-card', { href: `#/tactics/${t.id}` },
      lazyBoard({ fen: t.fen, setup: t.setup }, { orientation: toMove(t) === 'w' ? 'white' : 'black', label: `${t.name} puzzle` }),
      h('div.tactic-card-body',
        h('h2', t.name, isSolved(t.id) ? h('span.seen', { title: 'Solved' }, icon('check', 16)) : null),
        h('p.mnemonic-sm', t.mnemonic),
        h('div.tags', tag(t.goal, t.goal === 'Checkmate' ? 'warn' : 'quiet')))))));
}

function toMove(t) { return buildLine({ fen: t.fen, setup: t.setup })[0].fen.split(' ')[1]; }

export function renderDetail(data, id) {
  const t = data.tactics.find((x) => x.id === id);
  if (!t) return page('Not found', h('h1', 'Unknown tactic'), h('p', h('a', { href: '#/tactics' }, 'See all tactics')));
  const idx = data.tactics.indexOf(t);
  const next = data.tactics[(idx + 1) % data.tactics.length];
  const prev = data.tactics[(idx - 1 + data.tactics.length) % data.tactics.length];

  const startFen = buildLine({ fen: t.fen, setup: t.setup })[0].fen;
  const me = startFen.split(' ')[1];
  let chess, step, busy, done, hintUsed;

  const status = h('div.puzzle-status', { 'aria-live': 'polite' });
  const reveal = h('div.puzzle-reveal', { hidden: true },
    h('h3', 'Why it works'), h('p', t.explanation),
    h('a.btn.btn-primary', { href: `#/tactics/${next.id}` }, 'Next: ' + next.name));
  const boardBox = h('div.puzzle-board');
  const board = new Board(boardBox, {
    orientation: me === 'w' ? 'white' : 'black',
    label: `${t.name} puzzle`,
    movable: (sq) => !busy && !done && chess.turn() === me && chess.get(sq)?.color === me,
    targets: (sq) => chess.moves({ square: sq, verbose: true }).map((m) => m.to),
    onMove: (from, to) => attempt(from, to),
  });

  const say = (kind, text) => { status.className = 'puzzle-status status-' + kind; status.replaceChildren(icon(kind === 'good' ? 'check' : kind === 'bad' ? 'x' : kind === 'hint' ? 'bulb' : 'target', 18), h('span', text)); };
  const sync = (mv, animate = true) => {
    board.setPosition(chess.fen(), { lastMove: mv ? { from: mv.from, to: mv.to } : null, animate });
    if (chess.inCheck()) board.setCheck(kingSquare(chess.fen(), chess.turn()));
  };

  function reset() {
    chess = new Chess(startFen); step = 0; busy = false; done = false; hintUsed = false;
    board.setArrows([]); board.setKeySquares([]);
    sync(null, false);
    reveal.hidden = true;
    say('turn', `${me === 'w' ? 'White' : 'Black'} to move. Goal: ${t.goal.toLowerCase()}.`);
  }

  function attempt(from, to) {
    const legal = chess.moves({ verbose: true }).find((m) => m.from === from && m.to === to && (!m.promotion || m.promotion === 'q'));
    if (!legal) return false;
    const want = t.solution[step];
    const mates = (() => { const c = new Chess(chess.fen()); c.move(legal.san); return c.isCheckmate(); })();
    if (strip(legal.san) !== strip(want) && !mates) {
      board.flash(to, 'bad');
      say('bad', wrongHint(legal));
      return false;
    }
    const mv = chess.move(legal.san);
    sync(mv);
    board.flash(to, 'good');
    step++;
    if (mates || step >= t.solution.length) return finish();
    busy = true;
    say('good', 'Correct — keep going.');
    setTimeout(() => {
      const reply = chess.move(t.solution[step]);
      step++;
      sync(reply);
      busy = false;
      if (step >= t.solution.length) finish();
      else say('turn', `${reply.san}. Your move.`);
    }, 650);
    return true;
  }
  function wrongHint(m) {
    if (m.captured) return `${m.san} grabs material, but the opponent has a good answer. Look for a more forcing move.`;
    if (!m.san.includes('+')) return `${m.san} isn't it. Checks, captures and threats first.`;
    return `${m.san} is forcing, but not the strongest. Try again.`;
  }
  function finish() {
    done = true;
    markSolved(t.id);
    say('good', hintUsed ? 'Solved with a hint. Try it again later without one.' : 'Solved! That is the idea.');
    board.setArrows((t.arrows || []).map(parseArrow));
    board.setKeySquares(t.squares || []);
    reveal.hidden = false;
    return true;
  }
  function hint() {
    if (done) return;
    hintUsed = true;
    const c = new Chess(chess.fen());
    const m = c.move(t.solution[step]);
    board.setKeySquares([m.from]);
    say('hint', t.hint || 'The highlighted piece makes the first move.');
  }
  async function showSolution() {
    if (busy) return;
    reset();
    busy = true; hintUsed = true;
    say('hint', 'Watch the solution.');
    for (const san of t.solution) {
      await new Promise((r) => setTimeout(r, 850));
      if (!boardBox.isConnected) return;
      sync(chess.move(san));
    }
    busy = false; step = t.solution.length;
    finish();
    say('hint', 'That was the solution. Press "Try again" to play it yourself.');
  }

  reset();
  return page(t.name,
    h('nav.crumbs', { 'aria-label': 'Breadcrumb' }, h('a', { href: '#/tactics' }, 'Tactics'), h('span', t.name)),
    h('div.study.study-puzzle',
      h('div.study-board', boardBox, status,
        h('div.puzzle-actions',
          h('button.btn', { type: 'button', onclick: hint }, icon('bulb', 16), 'Hint'),
          h('button.btn', { type: 'button', onclick: showSolution }, icon('eye', 16), 'Show solution'),
          h('button.btn', { type: 'button', onclick: reset }, icon('reset', 16), 'Try again'))),
      h('div.study-text',
        h('header.study-head', h('h1', t.name), h('p.mnemonic', t.mnemonic)),
        h('h3', 'Definition'), h('p', t.definition),
        h('p.muted', 'Drag a piece or tap it and then its destination.'),
        reveal)),
    h('nav.pager', h('a', { href: `#/tactics/${prev.id}` }, '← ' + prev.name), h('a', { href: `#/tactics/${next.id}` }, next.name + ' →')));
}
