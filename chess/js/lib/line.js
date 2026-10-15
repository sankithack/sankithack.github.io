// Shared by the site and by scripts/validate-data.mjs — keep it free of DOM code.
import { Chess } from '../vendor/chess.js';

export { Chess };
export const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

/** A move in the data files is either a SAN string or { san, note, arrows, squares }. */
export const normMove = (m) => (typeof m === 'string' ? { san: m } : m);

/**
 * Replays a line and returns one frame per position (frame 0 = start).
 *   fen   – starting position (default: initial position)
 *   setup – moves played silently first (to reach a puzzle position)
 *   moves – the moves the learner steps through
 * Throws on any illegal move so broken data is caught by the validator.
 */
export function buildLine({ fen, setup = [], moves = [] } = {}) {
  const chess = new Chess(fen || START_FEN);
  setup.forEach((s, i) => {
    try { chess.move(normMove(s).san); }
    catch { throw new Error(`illegal setup move #${i + 1} "${normMove(s).san}" at ${chess.fen()}`); }
  });
  const frames = [{ fen: chess.fen(), ply: 0, san: null }];
  moves.map(normMove).forEach((m, i) => {
    let mv;
    try { mv = chess.move(m.san); }
    catch { throw new Error(`illegal move #${i + 1} "${m.san}" at ${chess.fen()}`); }
    frames.push({
      fen: chess.fen(), ply: i + 1, san: mv.san, from: mv.from, to: mv.to, color: mv.color,
      note: m.note || null, arrows: m.arrows, squares: m.squares,
      check: chess.inCheck(), mate: chess.isCheckmate(), captured: mv.captured,
    });
  });
  return frames;
}

/** Scoresheet rows: [{ num, white: frameIndex|null, black: frameIndex|null }] */
export function scoresheet(frames) {
  const [, turn, , , , full] = frames[0].fen.split(' ');
  let num = Number(full) || 1;
  const rows = [];
  let row = null;
  frames.slice(1).forEach((f, i) => {
    const idx = i + 1;
    if (f.color === 'w') { row = { num, white: idx, black: null }; rows.push(row); }
    else {
      if (!row || row.black !== null || row.num !== num) { row = { num, white: null, black: idx }; rows.push(row); }
      else row.black = idx;
      num += 1;
    }
  });
  if (turn === 'b' && rows[0] && rows[0].white === null) rows[0].num = Number(full) || 1;
  return rows;
}

/** "1.e4 e5 2.Nf3" — used for compact line previews. */
export function lineText(moves, opts = {}) {
  let frames;
  try { frames = buildLine({ ...opts, moves }); } catch { return moves.map((m) => normMove(m).san).join(' '); }
  return scoresheet(frames)
    .map((r) => `${r.num}.${r.white ? frames[r.white].san : '..'}${r.black ? ' ' + frames[r.black].san : ''}`)
    .join(' ');
}

const SQ = /^[a-h][1-8]$/;
export const isSquare = (s) => SQ.test(s);

/** Arrow strings: "g1f3" plan (green) · "!d8h4" threat (red) · "~e2e4" alternative (blue). */
export function parseArrow(str) {
  let kind = 'plan';
  let s = str;
  if (s[0] === '!') { kind = 'threat'; s = s.slice(1); }
  else if (s[0] === '~') { kind = 'alt'; s = s.slice(1); }
  const from = s.slice(0, 2), to = s.slice(2, 4);
  if (s.length !== 4 || !SQ.test(from) || !SQ.test(to) || from === to) throw new Error(`bad arrow "${str}"`);
  return { from, to, kind };
}
