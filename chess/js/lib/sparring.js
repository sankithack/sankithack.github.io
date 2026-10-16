// Sparring: play an endgame out against the computer.
//   mode "solver": king+pawn positions — a Web Worker solves the position; any move that keeps
//                  the result is accepted and the computer defends perfectly.
//   mode "mate":   K+Q / K+R / K+B+B vs K — a heuristic defender runs for the centre, grabs loose
//                  pieces, and you must mate within 50 moves without stalemating.
import { Board } from './board.js';
import { Chess } from './line.js';
import { kingSquare } from './viewer.js';
import { findMove, moveForm } from './moves.js';
import { h, icon } from './dom.js';
import { play } from './sound.js';

let worker, seq = 0;
const pending = new Map();
function ask(msg) {
  if (!worker) {
    worker = new Worker(new URL('./kp-worker.js', import.meta.url), { type: 'module' });
    worker.onmessage = ({ data }) => { pending.get(data.id)?.(data); pending.delete(data.id); };
  }
  return new Promise((res) => { const id = ++seq; pending.set(id, res); worker.postMessage({ ...msg, id }); });
}

const center = (sq) => Math.abs('abcdefgh'.indexOf(sq[0]) - 3.5) + Math.abs(+sq[1] - 4.5);
/** Defender for the basic mates. Higher score = better for the lone king. */
function defenderMove(chess) {
  const moves = chess.moves({ verbose: true });
  let best = null, bestScore = -Infinity;
  for (const m of moves) {
    chess.move(m);
    let score = 0;
    if (m.captured) score += 10000; // free piece!
    const replies = chess.moves({ verbose: true });
    if (replies.some((r) => { chess.move(r); const mate = chess.isCheckmate(); chess.undo(); return mate; })) score -= 5000;
    const k = kingSquare(chess.fen(), m.color);
    score -= center(k) * 10;
    chess.undo();
    score += Math.random(); // don't be predictable
    if (score > bestScore) { bestScore = score; best = m; }
  }
  return best;
}

export class Sparring {
  /** o: { fen, mode: 'solver'|'mate', userSide: 'w'|'b', goal: 'win'|'draw', title, onDone({ success }) } */
  constructor(mount, o) {
    this.o = o;
    this.el = h('div.sparring');
    const boardBox = h('div.drill-board');
    this.board = new Board(boardBox, {
      orientation: o.userSide === 'b' ? 'black' : 'white',
      label: 'Sparring board',
      movable: (sq) => this.ready() && this.chess.get(sq)?.color === this.o.userSide,
      targets: (sq) => this.chess.moves({ square: sq, verbose: true }).map((m) => m.to),
      onMove: (from, to) => this.userMove(this.chess.moves({ verbose: true }).find((m) => m.from === from && m.to === to && (!m.promotion || m.promotion === 'q'))),
    });
    this.status = h('div.puzzle-status', { 'aria-live': 'polite' });
    this.counter = h('span.muted.small');
    this.el.append(boardBox, this.status,
      h('div.puzzle-actions',
        h('button.btn', { type: 'button', onclick: () => this.start() }, icon('reset', 16), 'Start again'),
        this.counter),
      moveForm((txt) => { if (!this.ready()) return; const m = findMove(this.chess, txt); m ? this.userMove(m) : this.say('bad', `"${txt}" isn't legal here.`); }));
    mount.append(this.el);
    this.start();
  }
  ready() { return !this.busy && !this.over && this.chess.turn() === this.o.userSide; }
  say(kind, text) {
    this.status.className = 'puzzle-status status-' + kind;
    this.status.replaceChildren(icon(kind === 'good' ? 'check' : kind === 'bad' ? 'x' : kind === 'hint' ? 'bulb' : 'target', 18), h('span', text));
  }
  sync(mv) {
    this.board.setPosition(this.chess.fen(), { lastMove: mv ? { from: mv.from, to: mv.to } : null });
    if (this.chess.inCheck()) this.board.setCheck(kingSquare(this.chess.fen(), this.chess.turn()));
    this.counter.textContent = `Move ${Math.ceil(this.plies / 2)}${this.o.mode === 'mate' ? ' of 50' : ''}`;
  }
  async start() {
    this.chess = new Chess(this.o.fen); this.over = false; this.busy = true; this.plies = 0; this.slips = 0;
    this.board.setArrows([]); this.board.setKeySquares([]);
    this.sync(null);
    if (this.o.mode === 'solver') {
      this.say('hint', 'The computer is solving this position…');
      const r = await ask({ type: 'solve', fen: this.o.fen });
      if (!r.ok) { this.say('bad', 'The solver failed: ' + r.error); return; }
    }
    this.busy = false;
    const goal = this.o.goal === 'draw' ? 'hold the draw' : this.o.mode === 'mate' ? 'checkmate the king' : 'win (promote safely)';
    this.say('turn', `You are ${this.o.userSide === 'w' ? 'White' : 'Black'}. Goal: ${goal}.`);
    if (this.chess.turn() !== this.o.userSide) this.reply();
  }
  async userMove(m) {
    if (!m || !this.ready()) return false;
    const mv = this.chess.move(m.san);
    if (this.o.mode === 'solver' && mv.promotion && this.o.goal === 'win') {
      // a queen that is simply captured (and can't be recaptured) is no win
      const cap = this.chess.moves({ verbose: true }).find((r) => r.to === mv.to);
      if (cap) {
        this.chess.move(cap);
        const recapture = this.chess.moves({ verbose: true }).some((r) => r.to === mv.to);
        this.chess.undo();
        if (!recapture) {
          this.chess.undo(); this.slips++;
          this.board.flash(mv.to, 'bad');
          this.say('bad', 'The new queen would just be captured. Support the queening square with your king first.');
          return false;
        }
      }
    }
    if (this.o.mode === 'solver' && !mv.promotion) {
      this.busy = true;
      const r = await ask({ type: 'query', fen: this.chess.fen() });
      this.busy = false;
      // r.val is from the opponent's point of view (side to move now)
      const keeps = this.o.goal === 'win' ? r.val === -1 : r.val !== 1;
      if (r.known && !keeps) {
        this.chess.undo();
        this.slips++;
        this.board.flash(mv.to, 'bad');
        this.say('bad', `${mv.san} ${this.o.goal === 'win' ? 'lets the win slip' : 'loses'} — try another move.`);
        return false;
      }
    }
    this.plies++;
    this.sync(mv);
    this.board.flash(mv.to, 'good');
    if (this.checkEnd(mv)) return true;
    this.reply();
    return true;
  }
  async reply() {
    this.busy = true;
    await new Promise((r) => setTimeout(r, 450));
    if (!this.el.isConnected) return;
    let mv;
    if (this.o.mode === 'solver') {
      const r = await ask({ type: 'query', fen: this.chess.fen() });
      mv = r.best ? this.chess.move(r.best) : this.chess.move(this.chess.moves()[0]);
    } else mv = this.chess.move(defenderMove(this.chess));
    this.plies++;
    this.sync(mv);
    this.busy = false;
    if (!this.checkEnd(mv)) this.say('turn', `${mv.san}. Your move.`);
  }
  checkEnd(mv) {
    const c = this.chess, mine = mv.color === this.o.userSide;
    let result = null;
    if (c.isCheckmate()) result = mine ? ['good', 'Checkmate — well done!', true] : ['bad', 'You were mated.', false];
    else if (c.isStalemate()) result = this.o.goal === 'draw' ? ['good', 'Stalemate — you held the draw!', true] : ['bad', 'Stalemate! The win is gone — always leave the king a move.', false];
    else if (c.isInsufficientMaterial()) result = this.o.goal === 'draw' ? ['good', 'Only kings left — draw secured!', true] : ['bad', 'Not enough material left to win.', false];
    else if (mv.promotion && this.o.mode === 'solver') {
      const canTake = c.moves({ verbose: true }).some((m) => m.to === mv.to);
      const userNearQueen = c.board().flat().some((p) => p && p.type === 'p' && p.color === this.o.userSide && p.square[1] === (this.o.userSide === 'w' ? '7' : '2'));
      if (mine) result = this.o.goal === 'win' ? ['good', `${mv.san} — promoted. The rest is a K+Q mate you already know.`, true] : ['good', `${mv.san} — you queened too. Draw secured!`, true];
      else if (canTake) result = null; // you can win the new queen back — play on
      else if (userNearQueen) result = this.o.goal === 'draw' ? ['good', 'Both sides get a queen — a draw. Well held!', true] : ['bad', 'Both sides queen — that is only a draw.', false];
      else result = ['bad', `The opponent queened — the ${this.o.goal} is lost.`, false];
    } else if (this.o.mode === 'mate' && this.plies >= 100) result = ['bad', '50 moves without mate — that is a draw. Push the king to the edge faster.', false];
    if (!result) return false;
    this.over = true;
    this.say(result[0], result[1] + (result[2] && this.slips ? ` (${this.slips} move${this.slips === 1 ? '' : 's'} taken back)` : ''));
    if (result[2]) { play('success'); this.el.classList.add('celebrate'); setTimeout(() => this.el.classList.remove('celebrate'), 900); }
    this.o.onDone?.({ success: result[2], clean: result[2] && !this.slips });
    return true;
  }
}
