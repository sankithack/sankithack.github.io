// LineDrill: play one side of a known line from memory. The app plays the other side,
// shows the coach note after each move, gives hints, and scores the run.
import { Board } from './board.js';
import { Chess, START_FEN, normMove, buildLine, parseArrow } from './line.js';
import { kingSquare } from './viewer.js';
import { bare, findMove, moveForm } from './moves.js';
import { h, icon } from './dom.js';

export class LineDrill {
  /** o: { fen, setup, moves, side: 'w'|'b', title, onDone({ mistakes, hints, userMoves, perfect }) } */
  constructor(mount, o) {
    this.o = o;
    this.el = h('div.drill');
    const boardBox = h('div.drill-board');
    this.board = new Board(boardBox, {
      orientation: o.side === 'b' ? 'black' : 'white',
      label: 'Practice board',
      movable: (sq) => this.ready() && this.chess.get(sq)?.color === this.o.side,
      targets: (sq) => this.chess.moves({ square: sq, verbose: true }).map((m) => m.to),
      onMove: (from, to) => this.attempt(this.chess.moves({ verbose: true }).find((m) => m.from === from && m.to === to && (!m.promotion || m.promotion === 'q'))),
    });
    this.status = h('div.puzzle-status', { 'aria-live': 'polite' });
    this.note = h('div.viewer-note.drill-note');
    this.bar = h('div.viewer-progress', h('span'));
    const form = moveForm((txt) => {
      if (!this.ready()) return;
      const m = findMove(this.chess, txt);
      if (!m) return this.say('bad', `"${txt}" isn't legal here.`);
      this.attempt(m);
    }, 'Type your move');
    this.el.append(boardBox, this.bar, this.status,
      h('div.puzzle-actions',
        h('button.btn', { type: 'button', onclick: () => this.hint() }, icon('bulb', 16), 'Hint'),
        h('button.btn', { type: 'button', onclick: () => this.reveal() }, icon('eye', 16), 'Show move'),
        h('button.btn', { type: 'button', onclick: () => this.start() }, icon('reset', 16), 'Restart')),
      form, this.note);
    mount.append(this.el);
    this.start();
  }
  ready() { return !this.busy && !this.finished && this.chess.turn() === this.o.side; }
  say(kind, text) {
    this.status.className = 'puzzle-status status-' + kind;
    this.status.replaceChildren(icon(kind === 'good' ? 'check' : kind === 'bad' ? 'x' : kind === 'hint' ? 'bulb' : 'target', 18), h('span', text));
  }
  start() {
    this.moves = this.o.moves.map(normMove);
    const start = buildLine({ fen: this.o.fen, setup: this.o.setup })[0].fen;
    this.chess = new Chess(start || START_FEN);
    this.i = 0; this.mistakes = 0; this.hints = 0; this.userMoves = 0; this.finished = false; this.busy = false; this.hintLevel = 0;
    this.board.setArrows([]); this.board.setKeySquares([]);
    this.board.setPosition(this.chess.fen(), { animate: false });
    this.note.replaceChildren(h('p', this.o.intro || `You play ${this.o.side === 'w' ? 'White' : 'Black'}. Find each move of the line.`));
    this.progress();
    this.say('turn', 'Your move.');
    this.auto();
  }
  progress() { this.bar.firstChild.style.width = `${(this.i / this.moves.length) * 100}%`; }
  play(san) {
    const mv = this.chess.move(san);
    this.board.setPosition(this.chess.fen(), { lastMove: { from: mv.from, to: mv.to } });
    if (this.chess.inCheck()) this.board.setCheck(kingSquare(this.chess.fen(), this.chess.turn()));
    const m = this.moves[this.i];
    this.board.setArrows((m.arrows || []).map(parseArrow));
    this.board.setKeySquares(m.squares || []);
    if (m.note) this.note.replaceChildren(h('p.note-move', mv.san), h('p', m.note));
    this.i++; this.hintLevel = 0;
    this.progress();
    return mv;
  }
  auto() {
    if (this.i >= this.moves.length) return this.finish();
    if (this.chess.turn() === this.o.side) return;
    this.busy = true;
    setTimeout(() => {
      if (!this.el.isConnected) return;
      const mv = this.play(this.moves[this.i].san);
      this.busy = false;
      if (this.i >= this.moves.length) return this.finish();
      this.say('turn', `${mv.san}. Your move.`);
    }, 550);
  }
  attempt(m) {
    if (!m || !this.ready()) return false;
    const want = this.moves[this.i];
    if (bare(m.san) !== bare(want.san)) {
      this.mistakes++;
      this.board.flash(m.to, 'bad');
      const legalBook = this.chess.moves().map(bare).includes(bare(want.san));
      this.say('bad', this.mistakes > 2 && legalBook ? `${m.san} is playable, but the line continues differently. Try a hint.` : `${m.san} isn't the move in this line. Think about the idea — or take a hint.`);
      return false;
    }
    this.userMoves++;
    this.play(want.san);
    this.board.flash(m.to, 'good');
    this.say('good', 'Correct.');
    this.auto();
    return true;
  }
  hint() {
    if (!this.ready()) return;
    const c = new Chess(this.chess.fen());
    const mv = c.move(this.moves[this.i].san);
    this.hints++;
    this.hintLevel++;
    if (this.hintLevel === 1) { this.board.setKeySquares([mv.from]); this.say('hint', 'Move the highlighted piece.'); }
    else { this.board.setArrows([{ from: mv.from, to: mv.to, kind: 'alt' }]); this.say('hint', `The move is ${mv.san}.`); }
  }
  reveal() { if (!this.ready()) return; this.hintLevel = 1; this.hint(); }
  finish() {
    if (this.finished) return;
    this.finished = true;
    this.bar.firstChild.style.width = '100%';
    const perfect = this.mistakes === 0 && this.hints === 0;
    this.say('good', perfect ? 'Perfect run — line mastered!' : `Done with ${this.mistakes} mistake${this.mistakes === 1 ? '' : 's'} and ${this.hints} hint${this.hints === 1 ? '' : 's'}. Run it again for a perfect score.`);
    this.el.classList.add('celebrate');
    setTimeout(() => this.el.classList.remove('celebrate'), 900);
    this.o.onDone?.({ mistakes: this.mistakes, hints: this.hints, userMoves: this.userMoves, perfect });
  }
}
