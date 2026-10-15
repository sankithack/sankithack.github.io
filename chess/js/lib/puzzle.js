// Puzzle: solve a tactic on the board (drag, tap or type). Used by the tactics pages and the puzzle rush.
import { Board } from './board.js';
import { Chess, buildLine, parseArrow } from './line.js';
import { kingSquare } from './viewer.js';
import { bare, findMove, moveForm } from './moves.js';
import { h, icon } from './dom.js';

export const startFenOf = (t) => buildLine({ fen: t.fen, setup: t.setup })[0].fen;

/**
 * o: { onSolved({ clean }), onFailed(), compact (no hint/solution buttons), failOnMistake }
 * returns { el, reset }
 */
export function createPuzzle(t, o = {}) {
  const startFen = startFenOf(t);
  const me = startFen.split(' ')[1];
  let chess, step, busy, done, hintUsed, mistakes;
  const el = h('div.puzzle');
  const status = h('div.puzzle-status', { 'aria-live': 'polite' });
  const boardBox = h('div.puzzle-board');
  const board = new Board(boardBox, {
    orientation: me === 'w' ? 'white' : 'black',
    label: `${t.name} puzzle`,
    movable: (sq) => !busy && !done && chess.turn() === me && chess.get(sq)?.color === me,
    targets: (sq) => chess.moves({ square: sq, verbose: true }).map((m) => m.to),
    onMove: (from, to) => attempt(chess.moves({ verbose: true }).find((m) => m.from === from && m.to === to && (!m.promotion || m.promotion === 'q' || bare(t.solution[step]).includes('=' + m.promotion.toUpperCase())))),
  });
  const say = (kind, text) => { status.className = 'puzzle-status status-' + kind; status.replaceChildren(icon(kind === 'good' ? 'check' : kind === 'bad' ? 'x' : kind === 'hint' ? 'bulb' : 'target', 18), h('span', text)); };
  const sync = (mv, animate = true) => {
    board.setPosition(chess.fen(), { lastMove: mv ? { from: mv.from, to: mv.to } : null, animate });
    if (chess.inCheck()) board.setCheck(kingSquare(chess.fen(), chess.turn()));
  };
  function reset() {
    chess = new Chess(startFen); step = 0; busy = false; done = false; hintUsed = false; mistakes = 0;
    board.setArrows([]); board.setKeySquares([]);
    sync(null, false);
    say('turn', `${me === 'w' ? 'White' : 'Black'} to move. Goal: ${t.goal.toLowerCase()}.`);
  }
  function attempt(legal) {
    if (!legal || busy || done || chess.turn() !== me) return false;
    const want = t.solution[step];
    const c = new Chess(chess.fen()); c.move(legal.san);
    const mates = c.isCheckmate();
    if (bare(legal.san) !== bare(want) && !mates) {
      mistakes++;
      board.flash(legal.to, 'bad');
      say('bad', wrongHint(legal));
      if (o.failOnMistake) { done = true; setTimeout(() => o.onFailed?.(), 700); }
      return false;
    }
    sync(chess.move(legal.san));
    board.flash(legal.to, 'good');
    step++;
    if (mates || step >= t.solution.length) return finish();
    busy = true;
    say('good', 'Correct — keep going.');
    setTimeout(() => {
      if (!el.isConnected) return;
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
    say('good', hintUsed ? 'Solved with help. Try it again later without hints.' : 'Solved!');
    board.setArrows((t.arrows || []).map(parseArrow));
    board.setKeySquares(t.squares || []);
    el.classList.add('celebrate'); setTimeout(() => el.classList.remove('celebrate'), 900);
    o.onSolved?.({ clean: !hintUsed && mistakes === 0 });
    return true;
  }
  function hint() {
    if (done || busy) return;
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
      if (!el.isConnected) return;
      sync(chess.move(san));
    }
    busy = false; step = t.solution.length;
    finish();
    say('hint', 'That was the solution. Press "Try again" to play it yourself.');
  }
  const form = moveForm((txt) => {
    if (busy || done || chess.turn() !== me) return;
    const m = findMove(chess, txt);
    if (!m) return say('bad', `"${txt}" isn't a legal move in this position.`);
    attempt(m);
  }, 'Type a move, e.g. Nf3');
  el.append(boardBox, status);
  if (!o.compact) el.append(h('div.puzzle-actions',
    h('button.btn', { type: 'button', onclick: hint }, icon('bulb', 16), 'Hint'),
    h('button.btn', { type: 'button', onclick: showSolution }, icon('eye', 16), 'Show solution'),
    h('button.btn', { type: 'button', onclick: reset }, icon('reset', 16), 'Try again')));
  el.append(form);
  reset();
  return { el, reset, hint };
}
