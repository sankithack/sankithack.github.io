// Helpers for typed moves and comparing SAN.
import { h } from './dom.js';

export const bare = (san) => san.replace(/[+#!?]/g, '');

/** Find a legal move from user text: SAN ("Nf3", "0-0", "exd5") or coordinates ("g1f3"). */
export function findMove(chess, txt) {
  const legal = chess.moves({ verbose: true }).filter((m) => !m.promotion || m.promotion === 'q' || /=[NRB]/i.test(txt));
  const s = txt.trim().replace(/0-0-0/g, 'O-O-O').replace(/0-0/g, 'O-O').replace(/[+#!?\s]/g, '');
  if (!s) return null;
  if (/^[a-h][1-8][a-h][1-8][qrbn]?$/i.test(s)) {
    const promo = s[4]?.toLowerCase() || 'q';
    return legal.find((m) => m.from + m.to === s.slice(0, 4).toLowerCase() && (!m.promotion || m.promotion === promo)) || null;
  }
  const exact = legal.find((m) => bare(m.san) === s);
  if (exact) return exact;
  const ci = legal.filter((m) => bare(m.san).toLowerCase() === s.toLowerCase());
  return ci.length === 1 ? ci[0] : null;
}

/** A small "type your move" form. onMove(text) returns nothing; the caller resolves the move. */
export function moveForm(onMove, placeholder = 'Type a move, e.g. Nf3') {
  const input = h('input.move-input', { type: 'text', placeholder, 'aria-label': 'Type a move in algebraic notation', autocomplete: 'off', autocapitalize: 'off', spellcheck: false });
  const form = h('form.move-form', { onsubmit: (e) => { e.preventDefault(); const v = input.value.trim(); if (v) { onMove(v); input.value = ''; } } },
    input, h('button.btn', { type: 'submit' }, 'Play'));
  form.input = input;
  return form;
}
