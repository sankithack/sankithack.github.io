// Animated chessboard: pieces glide between squares, captures fade, arrows draw themselves.
// Pure DOM + SVG, no dependencies besides the piece set.
import { PIECES } from '../vendor/pieces.js';
import { h, reducedMotion } from './dom.js';
import { play } from './sound.js';

const FILES = 'abcdefgh';
const KIND_COLORS = { plan: 'var(--arrow-plan)', threat: 'var(--arrow-threat)', alt: 'var(--arrow-alt)' };

export function parseFen(fen) {
  const map = new Map();
  fen.split(' ')[0].split('/').forEach((row, r) => {
    let f = 0;
    for (const ch of row) {
      if (/\d/.test(ch)) { f += +ch; continue; }
      map.set(FILES[f] + (8 - r), (ch === ch.toUpperCase() ? 'w' : 'b') + ch.toUpperCase());
      f++;
    }
  });
  return map;
}

export class Board {
  /**
   * @param {HTMLElement} mount
   * @param {object} o
   *   orientation 'white'|'black', coords bool, size 'sm'|'md',
   *   movable(square) -> bool          which pieces the user may pick up
   *   targets(square) -> string[]      legal destinations for highlighting
   *   onMove(from, to) -> bool          return false to snap back
   *   onSquare(square)                  any square clicked (used by the square trainer)
   *   label                             accessible name
   */
  constructor(mount, o = {}) {
    this.o = { orientation: 'white', coords: true, ...o };
    this.pieces = []; // { el, code, sq }
    this.marks = { last: [], key: [], check: [], sel: [], dots: [] };
    this.el = h('div.board', { role: 'img', 'aria-label': o.label || 'Chessboard' });
    if (o.size) this.el.classList.add('board--' + o.size);
    this.sqLayer = h('div.board-squares');
    this.markLayer = h('div.board-marks');
    this.pieceLayer = h('div.board-pieces');
    this.svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    this.svg.setAttribute('viewBox', '0 0 800 800');
    this.svg.classList.add('board-arrows');
    this.el.append(this.sqLayer, this.markLayer, this.pieceLayer, this.svg);
    mount.append(this.el);
    this.drawSquares();
    if (o.movable || o.onSquare) this.bindPointer();
  }

  // ---------- geometry
  xy(sq) {
    const f = FILES.indexOf(sq[0]), r = +sq[1] - 1;
    return this.o.orientation === 'white' ? [f, 7 - r] : [7 - f, r];
  }
  sqAt(x, y) {
    const f = this.o.orientation === 'white' ? x : 7 - x;
    const r = this.o.orientation === 'white' ? 7 - y : y;
    return FILES[f] + (r + 1);
  }
  place(el, sq) { const [x, y] = this.xy(sq); el.style.transform = `translate(${x * 100}%, ${y * 100}%)`; }

  drawSquares() {
    this.sqLayer.replaceChildren();
    for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) {
      const sq = this.sqAt(x, y);
      const dark = (FILES.indexOf(sq[0]) + +sq[1]) % 2 === 0;
      const cell = h('div.sq' + (dark ? '.sq-dark' : '.sq-light'), { 'data-sq': sq });
      if (this.o.coords) {
        if (x === 0) cell.append(h('span.coord.coord-rank', sq[1]));
        if (y === 7) cell.append(h('span.coord.coord-file', sq[0]));
      }
      this.sqLayer.append(cell);
    }
  }

  setOrientation(o) {
    if (o === this.o.orientation) return;
    this.o.orientation = o;
    this.drawSquares();
    this.pieces.forEach((p) => this.place(p.el, p.sq));
    this.renderMarks();
    this.renderArrows(this.arrows || [], false);
  }
  flip() { this.setOrientation(this.o.orientation === 'white' ? 'black' : 'white'); }
  setCoords(on) { this.o.coords = on; this.drawSquares(); }

  // ---------- pieces
  /** Show a position. Pieces that stayed keep their element; moved pieces glide; captures fade. */
  setPosition(fen, { lastMove = null, animate = true } = {}) {
    this.fen = fen;
    const want = parseFen(fen);
    const anim = animate && !reducedMotion();
    this.el.classList.toggle('no-anim', !anim);
    const left = new Set(this.pieces);
    const keep = [];
    const todo = [];
    for (const [sq, code] of want) {
      const same = [...left].find((p) => p.sq === sq && p.code === code);
      if (same) { left.delete(same); keep.push(same); } else todo.push([sq, code]);
    }
    // match moved pieces: prefer the piece that made lastMove, then the nearest of the same type
    const dist = (a, b) => Math.abs(a.charCodeAt(0) - b.charCodeAt(0)) + Math.abs(+a[1] - +b[1]);
    if (lastMove) todo.sort((a, b) => (b[0] === lastMove.to) - (a[0] === lastMove.to));
    for (const [sq, code] of todo) {
      let cand = [...left].filter((p) => p.code === code);
      if (lastMove && sq === lastMove.to) {
        const mover = [...left].find((p) => p.sq === lastMove.from);
        if (mover && (mover.code === code || mover.code[1] === 'P')) cand = [mover];
      }
      cand.sort((a, b) => dist(a.sq, sq) - dist(b.sq, sq));
      const p = cand[0];
      if (p) {
        left.delete(p);
        if (p.code !== code) { p.code = code; p.el.innerHTML = PIECES[code]; } // promotion
        p.sq = sq;
        p.el.classList.add('moving');
        this.place(p.el, sq);
        setTimeout(() => p.el.classList.remove('moving'), 320);
        keep.push(p);
      } else {
        const el = h('div.piece.entering', { html: PIECES[code], 'data-piece': code });
        this.place(el, sq);
        this.pieceLayer.append(el);
        requestAnimationFrame(() => requestAnimationFrame(() => el.classList.remove('entering')));
        keep.push({ el, code, sq });
      }
    }
    for (const p of left) {
      p.el.classList.add('leaving');
      setTimeout(() => p.el.remove(), anim ? 260 : 0);
    }
    this.pieces = keep;
    // a removed piece means a capture (promotions reuse the pawn's element, castling removes nothing)
    if (lastMove && animate && !this.o.silent) play(left.size ? 'capture' : 'move');
    this.marks.last = lastMove ? [lastMove.from, lastMove.to] : [];
    this.marks.check = [];
    this.renderMarks();
  }
  pieceAt(sq) { return this.pieces.find((p) => p.sq === sq); }

  // ---------- marks & arrows
  setKeySquares(squares = []) { this.marks.key = squares; this.renderMarks(); }
  setCheck(sq) { this.marks.check = sq ? [sq] : []; this.renderMarks(); if (sq && !this.o.silent) play('check'); }
  renderMarks() {
    this.markLayer.replaceChildren();
    const add = (sq, cls) => { const m = h('div.mark.' + cls); this.place(m, sq); this.markLayer.append(m); };
    this.marks.last.forEach((s) => add(s, 'mark-last'));
    this.marks.key.forEach((s) => add(s, 'mark-key'));
    this.marks.sel.forEach((s) => add(s, 'mark-sel'));
    this.marks.check.forEach((s) => add(s, 'mark-check'));
    this.marks.dots.forEach((s) => add(s, this.pieceAt(s) ? 'mark-capture' : 'mark-dot'));
  }
  flash(sq, kind) {
    if (kind === 'bad' && !this.o.silent) play('error');
    const m = h('div.mark.mark-flash.flash-' + kind);
    this.place(m, sq);
    this.markLayer.append(m);
    setTimeout(() => m.remove(), 650);
  }

  /** arrows: [{ from, to, kind: plan|threat|alt }] */
  setArrows(arrows = []) { this.arrows = arrows; this.renderArrows(arrows, true); }
  renderArrows(arrows, animate) {
    this.svg.replaceChildren();
    arrows.forEach((a, i) => {
      const [x1, y1] = this.xy(a.from).map((v) => v * 100 + 50);
      const [x2, y2] = this.xy(a.to).map((v) => v * 100 + 50);
      const len = Math.hypot(x2 - x1, y2 - y1), ux = (x2 - x1) / len, uy = (y2 - y1) / len;
      const head = 34, w = 15;
      const sx = x1 + ux * 22, sy = y1 + uy * 22; // start a little off-centre
      const ex = x2 - ux * head, ey = y2 - uy * head;
      const g = document.createElementNS(this.svg.namespaceURI, 'g');
      g.setAttribute('class', `arrow arrow-${a.kind}`);
      g.style.color = KIND_COLORS[a.kind] || KIND_COLORS.plan;
      const line = document.createElementNS(this.svg.namespaceURI, 'line');
      Object.entries({ x1: sx, y1: sy, x2: ex, y2: ey, 'stroke-width': w, stroke: 'currentColor', 'stroke-linecap': 'round' })
        .forEach(([k, v]) => line.setAttribute(k, v));
      const shaft = Math.hypot(ex - sx, ey - sy);
      line.style.strokeDasharray = shaft;
      line.style.strokeDashoffset = animate && !reducedMotion() ? shaft : 0;
      const px = -uy, py = ux;
      const poly = document.createElementNS(this.svg.namespaceURI, 'polygon');
      poly.setAttribute('points', [[x2 - ux * 6, y2 - uy * 6], [ex + px * 24, ey + py * 24], [ex - px * 24, ey - py * 24]].map((p) => p.join(',')).join(' '));
      poly.setAttribute('fill', 'currentColor');
      g.append(line, poly);
      g.style.setProperty('--d', `${i * 90}ms`);
      this.svg.append(g);
      if (animate && !reducedMotion()) requestAnimationFrame(() => requestAnimationFrame(() => { line.style.strokeDashoffset = 0; g.classList.add('shown'); }));
      else g.classList.add('shown');
    });
  }

  // ---------- interaction (click-click and drag, mouse + touch)
  select(sq) {
    this.selected = sq;
    this.marks.sel = sq ? [sq] : [];
    this.marks.dots = sq && this.o.targets ? this.o.targets(sq) : [];
    this.renderMarks();
  }
  async tryMove(from, to) {
    this.select(null);
    const ok = await this.o.onMove?.(from, to);
    if (ok === false) { const p = this.pieceAt(from); if (p) this.place(p.el, from); }
    return ok;
  }
  bindPointer() {
    const el = this.el;
    el.classList.add('interactive');
    const sqFromEvent = (e) => {
      const r = el.getBoundingClientRect();
      const x = Math.floor(((e.clientX - r.left) / r.width) * 8), y = Math.floor(((e.clientY - r.top) / r.height) * 8);
      return x < 0 || x > 7 || y < 0 || y > 7 ? null : this.sqAt(x, y);
    };
    let drag = null;
    el.addEventListener('pointerdown', (e) => {
      if (e.button > 0) return;
      const sq = sqFromEvent(e);
      if (!sq) return;
      if (this.o.onSquare) { this.o.onSquare(sq); return; }
      if (this.selected && this.selected !== sq && this.marks.dots.includes(sq)) { this.tryMove(this.selected, sq); return; }
      const p = this.pieceAt(sq);
      if (p && this.o.movable?.(sq)) {
        e.preventDefault();
        this.select(sq);
        const r = el.getBoundingClientRect();
        drag = { p, from: sq, r, moved: false, x0: e.clientX, y0: e.clientY };
        el.setPointerCapture(e.pointerId);
      } else this.select(null);
    });
    el.addEventListener('pointermove', (e) => {
      if (!drag) return;
      if (!drag.moved && Math.hypot(e.clientX - drag.x0, e.clientY - drag.y0) < 4) return;
      drag.moved = true;
      const s = drag.r.width / 8;
      drag.p.el.classList.add('dragging');
      drag.p.el.style.transform = `translate(${e.clientX - drag.r.left - s / 2}px, ${e.clientY - drag.r.top - s / 2}px)`;
    });
    const end = (e) => {
      if (!drag) return;
      const d = drag; drag = null;
      d.p.el.classList.remove('dragging');
      const to = sqFromEvent(e);
      if (d.moved && to && to !== d.from && this.marks.dots.includes(to)) this.tryMove(d.from, to);
      else this.place(d.p.el, d.from);
    };
    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', end);
  }
}
