// Quick game review (not an engine): one-move-deep checks for mates and loose pieces.
// Shared by the review page and tests, so keep it free of DOM code.
import { Chess } from '../vendor/chess.js';

const VALUE = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };

/** Parse PGN → { startFen, sans, headers } or throw a readable error. */
export function parsePgn(text) {
  const c = new Chess();
  try { c.loadPgn(text.trim()); } catch (e) { throw new Error('That PGN could not be read: ' + e.message); }
  const headers = c.getHeaders();
  const sans = c.history();
  if (!sans.length) throw new Error('The PGN has no moves.');
  const startFen = headers.FEN || new Chess().fen();
  return { startFen, sans, headers };
}

/** Moves that mate at once. */
export function matesInOne(chess) {
  const out = [];
  for (const m of chess.moves({ verbose: true })) { chess.move(m); if (chess.isCheckmate()) out.push(m); chess.undo(); }
  return out;
}

/** A forced mate in two that starts with a check (cheap: checks are few). Returns the first move or null. */
export function checkingMateInTwo(chess) {
  for (const m of chess.moves({ verbose: true })) {
    if (!/[+#]/.test(m.san)) continue;
    chess.move(m);
    let ok = chess.isCheckmate();
    if (!ok && !chess.isGameOver()) {
      ok = chess.moves({ verbose: true }).every((r) => { chess.move(r); const mate = matesInOne(chess).length > 0; chess.undo(); return mate; });
    }
    chess.undo();
    if (ok) return m;
  }
  return null;
}

/** Captures that gain material: value taken minus value lost if the piece is simply taken back. */
export function winningCaptures(chess, minGain = 2) {
  const out = [];
  for (const m of chess.moves({ verbose: true })) {
    if (!m.captured) continue;
    chess.move(m);
    const recapture = chess.moves({ verbose: true }).some((r) => r.to === m.to);
    chess.undo();
    const gain = VALUE[m.captured] - (recapture ? VALUE[m.piece] : 0);
    if (gain >= minGain) out.push({ move: m, gain });
  }
  return out.sort((a, b) => b.gain - a.gain);
}

/** Checks and captures for the side to move (for the overlay). */
export function forcingMoves(chess) {
  return chess.moves({ verbose: true }).filter((m) => m.captured || /[+#]/.test(m.san));
}

/** After the side that just moved: does every reply allow mate in one (i.e. the move was a forced mate in two)? */
function leadsToMate(chess) {
  if (chess.isGameOver()) return chess.isCheckmate();
  return chess.moves({ verbose: true }).every((r) => { chess.move(r); const m = matesInOne(chess).length > 0; chess.undo(); return m; });
}

const pieceName = { p: 'pawn', n: 'knight', b: 'bishop', r: 'rook', q: 'queen', k: 'king' };

/**
 * Review a game. Returns one entry per ply: { san, flags: [{ kind: 'allowed-mate'|'hanging'|'missed-mate'|'missed-win', text, move }] }
 */
export function reviewGame(startFen, sans) {
  const c = new Chess(startFen);
  const out = [];
  for (const san of sans) {
    const before = c.fen();
    const forced = c.moves().length === 1;
    const mates = matesInOne(c);
    const wins = winningCaptures(c, 3);
    const mv = c.move(san);
    const flags = [];
    const moverGain = mv.captured ? VALUE[mv.captured] : 0;
    if (forced) { out.push({ san: mv.san, before, after: c.fen(), color: mv.color, flags, forced: true }); continue; }
    if (mates.length && !c.isCheckmate()) flags.push({ kind: 'missed-mate', text: `Missed mate: ${mates[0].san} was checkmate.`, move: mates[0] });
    else if (wins.length && !c.isCheckmate() && !leadsToMate(c)) {
      const playedGain = wins.find((w) => w.move.san === mv.san)?.gain ?? moverGain;
      if (wins[0].gain - playedGain >= 2) flags.push({ kind: 'missed-win', text: `Missed: ${wins[0].move.san} won a ${pieceName[wins[0].move.captured]}.`, move: wins[0].move });
    }
    if (!c.isGameOver()) {
      const oppMates = matesInOne(c);
      const oppMate2 = oppMates.length ? null : checkingMateInTwo(c);
      if (oppMates.length) flags.push({ kind: 'allowed-mate', text: `Allows mate: ${oppMates[0].san}.`, move: oppMates[0] });
      else if (oppMate2) flags.push({ kind: 'allowed-mate', text: `Allows a forced mate in two, starting with ${oppMate2.san}.`, move: oppMate2 });
      else {
        const oppWins = winningCaptures(c, 3);
        if (oppWins.length && oppWins[0].gain - moverGain >= 2) {
          const t = `${oppWins[0].move.san} wins a ${pieceName[oppWins[0].move.captured]}`;
          c.move(oppWins[0].move);
          const punish = checkingMateInTwo(c) || matesInOne(c)[0];
          c.undo();
          if (punish) flags.push({ kind: 'sound-sacrifice', text: `Sound sacrifice: if ${t.replace(' wins a', ' takes the')}, ${punish.san} leads to mate.`, move: oppWins[0].move });
          else flags.push(/[+#]/.test(mv.san)
            ? { kind: 'sacrifice', text: `Sacrifice with check: ${t}. Was it sound? Check the follow-up.`, move: oppWins[0].move }
            : { kind: 'hanging', text: `Leaves material loose: ${t}.`, move: oppWins[0].move });
        }
      }
    }
    out.push({ san: mv.san, before, after: c.fen(), color: mv.color, flags });
  }
  return out;
}
