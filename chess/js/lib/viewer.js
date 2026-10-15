// LineViewer: a board plus step controls, autoplay, keyboard support, a scoresheet and coach notes.
import { Board } from './board.js';
import { buildLine, scoresheet, parseArrow } from './line.js';
import { h, icon } from './dom.js';

let activeViewer = null;
document.addEventListener('keydown', (e) => {
  if (!activeViewer || !activeViewer.el.isConnected) return;
  if (e.target.closest('input, textarea, select, [contenteditable]')) return;
  const k = { ArrowLeft: 'prev', ArrowRight: 'next', Home: 'first', End: 'last', ' ': 'toggle' }[e.key];
  if (!k) return;
  e.preventDefault();
  activeViewer[k]();
});

export class LineViewer {
  /**
   * @param {HTMLElement} mount
   * @param {object} o  orientation, size, autoplay (ms per move), loop, onEnd, showNotes, showSheet
   */
  constructor(mount, o = {}) {
    this.o = { showNotes: true, showSheet: true, speed: 1100, ...o };
    this.el = h('div.viewer');
    const boardWrap = h('div.viewer-board');
    this.board = new Board(boardWrap, { orientation: o.orientation || 'white', size: o.size, label: o.label });
    this.btn = {};
    const b = (name, label, fn) => (this.btn[name] = h('button.icon-btn', { type: 'button', 'aria-label': label, title: label, onclick: fn }, icon(name)));
    this.counter = h('span.viewer-count', { 'aria-live': 'polite' });
    this.controls = h('div.viewer-controls',
      b('first', 'Start (Home)', () => this.first()),
      b('prev', 'Previous move (←)', () => this.prev()),
      b('play', 'Play / pause (Space)', () => this.toggle()),
      b('next', 'Next move (→)', () => this.next()),
      b('last', 'End (End)', () => this.last()),
      this.counter,
      b('flip', 'Flip board', () => this.board.flip()));
    this.progress = h('div.viewer-progress', h('span'));
    this.note = h('div.viewer-note', { 'aria-live': 'polite' });
    this.sheet = h('ol.scoresheet');
    this.el.append(boardWrap, this.progress, this.controls);
    if (this.o.showNotes) this.el.append(this.note);
    if (this.o.showSheet) this.el.append(this.sheet);
    mount.append(this.el);
    // swipe left/right on the board to step through the moves (phones)
    let sx = null, sy = 0;
    boardWrap.addEventListener('pointerdown', (e) => { if (e.pointerType !== 'mouse') { sx = e.clientX; sy = e.clientY; } });
    boardWrap.addEventListener('pointerup', (e) => {
      if (sx === null) return;
      const dx = e.clientX - sx, dy = e.clientY - sy;
      sx = null;
      if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy) * 1.5) dx < 0 ? this.next() : this.prev();
    });
    if (this.o.keys !== false) {
      this.el.addEventListener('pointerdown', () => (activeViewer = this));
      activeViewer = this;
    }
  }

  /** spec: { fen, setup, moves, title, intro, arrows, squares, orientation, startAt } */
  load(spec) {
    this.stop();
    this.spec = spec;
    this.frames = buildLine(spec);
    this.i = 0;
    if (spec.orientation) this.board.setOrientation(spec.orientation);
    this.renderSheet();
    this.show(spec.startAt ?? 0, false);
    if (this.o.keys !== false) activeViewer = this;
    if (this.o.autoplay) this.play();
    return this;
  }

  renderSheet() {
    this.sheet.replaceChildren();
    this.cells = [];
    for (const row of scoresheet(this.frames)) {
      const cell = (idx) => {
        if (idx == null) return h('span.ply.ply-empty', '…');
        const f = this.frames[idx];
        const c = h('button.ply', { type: 'button', onclick: () => { this.stop(); this.show(idx); } }, f.san);
        if (f.note) c.classList.add('has-note');
        this.cells[idx] = c;
        return c;
      };
      this.sheet.append(h('li.sheet-row', h('span.sheet-num', row.num + '.'), cell(row.white), cell(row.black)));
    }
  }

  show(i, animate = true) {
    i = Math.max(0, Math.min(this.frames.length - 1, i));
    this.i = i;
    const f = this.frames[i];
    this.board.setPosition(f.fen, { lastMove: f.from ? { from: f.from, to: f.to } : null, animate });
    const marks = i === 0 ? this.spec : f;
    let arrows = [];
    try { arrows = (marks.arrows || []).map(parseArrow); } catch { /* validated at build time */ }
    this.board.setArrows(arrows);
    this.board.setKeySquares(marks.squares || []);
    if (f.check) this.board.setCheck(kingSquare(f.fen, f.fen.split(' ')[1]));
    this.cells?.forEach((c, idx) => c && c.classList.toggle('current', idx === i));
    const cell = this.cells?.[i];
    if (cell && this.o.showSheet) {
      const box = this.sheet, top = cell.offsetTop - box.offsetTop;
      if (top < box.scrollTop || top + cell.offsetHeight > box.scrollTop + box.clientHeight) box.scrollTop = top - box.clientHeight / 2;
    }
    const total = this.frames.length - 1;
    this.counter.textContent = total ? `${i} / ${total}` : '';
    this.progress.firstChild.style.width = total ? `${(i / total) * 100}%` : '0%';
    this.btn.first.disabled = this.btn.prev.disabled = i === 0;
    this.btn.next.disabled = this.btn.last.disabled = i === total;
    this.btn.play.disabled = total === 0;
    this.renderNote(f, i);
    this.o.onStep?.(i, f);
    if (i === total && total > 0) this.o.onEnd?.();
  }

  renderNote(f, i) {
    this.note.replaceChildren();
    if (i === 0) {
      if (this.spec.intro) this.note.append(h('p', this.spec.intro));
      else this.note.append(h('p.muted', this.frames.length > 1 ? 'Step through with → or press play.' : ''));
      return;
    }
    const label = (f.color === 'w' ? `${moveNo(this.frames, i)}.` : `${moveNo(this.frames, i)}…`) + f.san;
    this.note.append(h('p.note-move', label, f.mate ? h('span.badge.badge-mate', 'Checkmate') : f.check ? h('span.badge', 'Check') : null));
    if (f.note) this.note.append(h('p', f.note));
    else if (i === this.frames.length - 1 && this.spec.outro) this.note.append(h('p', this.spec.outro));
  }

  next() { this.show(this.i + 1); if (this.i === this.frames.length - 1) this.stop(); }
  prev() { this.stop(); this.show(this.i - 1); }
  first() { this.stop(); this.show(0); }
  last() { this.stop(); this.show(this.frames.length - 1); }
  toggle() { this.timer ? this.stop() : this.play(); }
  play() {
    if (this.frames.length < 2) return;
    if (this.i === this.frames.length - 1) this.show(0);
    this.btn.play.replaceChildren(icon('pause'));
    this.el.classList.add('playing');
    const tick = () => {
      if (!this.el.isConnected) return this.stop();
      const r = this.el.getBoundingClientRect();
      if (document.hidden || r.bottom < 0 || r.top > innerHeight) { this.timer = setTimeout(tick, 700); return; } // don't play to an empty room
      if (this.i >= this.frames.length - 1) {
        if (this.o.loop) { this.timer = setTimeout(() => { this.show(0); this.timer = setTimeout(tick, this.o.speed); }, 2600); return; }
        return this.stop();
      }
      this.show(this.i + 1);
      this.timer = setTimeout(tick, this.o.speed);
    };
    this.timer = setTimeout(tick, this.i === 0 ? 500 : this.o.speed);
  }
  stop() {
    clearTimeout(this.timer);
    this.timer = null;
    this.btn?.play.replaceChildren(icon('play'));
    this.el?.classList.remove('playing');
  }
}

function moveNo(frames, i) {
  const [, turn, , , , full] = frames[0].fen.split(' ');
  const plyFromWhite = (turn === 'w' ? 0 : 1) + i - 1;
  return (Number(full) || 1) + Math.floor(plyFromWhite / 2);
}
export function kingSquare(fen, color) {
  const rows = fen.split(' ')[0].split('/');
  const k = color === 'w' ? 'K' : 'k';
  for (let r = 0; r < 8; r++) {
    let f = 0;
    for (const ch of rows[r]) {
      if (/\d/.test(ch)) f += +ch;
      else { if (ch === k) return 'abcdefgh'[f] + (8 - r); f++; }
    }
  }
  return null;
}
