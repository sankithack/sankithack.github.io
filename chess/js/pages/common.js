import { h, cap } from '../lib/dom.js';
import { Board } from '../lib/board.js';
import { buildLine, parseArrow } from '../lib/line.js';

export const page = (title, ...kids) => h('section.page', { 'data-title': title }, kids);

export function pageHead(title, lede, extra) {
  return h('header.page-head', h('h1', title), lede ? h('p.lede', lede) : null, extra);
}

export const tag = (text, kind = '') => h('span.tag' + (kind ? '.tag-' + kind : ''), text);
export const levelTag = (lvl) => tag(cap(lvl), 'level-' + lvl);

/** Segmented filter: options [[value, label]], calls onChange(value). */
export function chips(label, options, value, onChange) {
  const group = h('div.chips', { role: 'radiogroup', 'aria-label': label });
  const paint = (v) => [...group.children].forEach((b) => { const on = b.dataset.v === v; b.classList.toggle('on', on); b.setAttribute('aria-checked', on); });
  options.forEach(([v, l]) => group.append(h('button.chip', { type: 'button', role: 'radio', 'data-v': v, onclick: () => { paint(v); onChange(v); } }, l)));
  paint(value);
  return group;
}

/** Circular progress meter. */
export function ring(value, max, label) {
  const pct = max ? value / max : 0;
  const r = 26, c = 2 * Math.PI * r;
  const svg = `<svg viewBox="0 0 64 64" width="64" height="64" aria-hidden="true">
    <circle cx="32" cy="32" r="${r}" class="ring-track"/>
    <circle cx="32" cy="32" r="${r}" class="ring-fill" stroke-dasharray="${c}" stroke-dashoffset="${c * (1 - pct)}"/></svg>`;
  return h('div.ring', { role: 'img', 'aria-label': `${label}: ${value} of ${max}` },
    h('div.ring-svg', { html: svg }, h('span.ring-num', String(value))),
    h('div.ring-text', h('strong', label), h('span.muted', `${value} of ${max}`)));
}

/** Static board for a position spec { fen, setup, moves, arrows, squares }. */
export function staticBoard(mount, spec, o = {}) {
  const frames = buildLine({ fen: spec.fen, setup: spec.setup, moves: spec.moves || [] });
  const f = frames[frames.length - 1];
  const b = new Board(mount, { coords: o.coords ?? false, size: o.size || 'sm', orientation: o.orientation || 'white', label: o.label });
  b.setPosition(f.fen, { animate: false, lastMove: o.lastMove && f.from ? { from: f.from, to: f.to } : null });
  if (spec.arrows) b.setArrows(spec.arrows.map(parseArrow));
  if (spec.squares) b.setKeySquares(spec.squares);
  return b;
}

/** Lazily render a static mini-board when it scrolls into view (keeps long lists fast). */
const io = 'IntersectionObserver' in window ? new IntersectionObserver((entries) => {
  entries.forEach((e) => { if (e.isIntersecting) { io.unobserve(e.target); e.target._render(); } });
}, { rootMargin: '200px' }) : null;
export function lazyBoard(spec, o) {
  const el = h('div.mini-board');
  el._render = () => staticBoard(el, spec, o);
  io ? io.observe(el) : el._render();
  return el;
}

export const sideLabel = (side) => (side === 'white' ? 'Play as White' : 'Play as Black');
