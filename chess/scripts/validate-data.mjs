// Validates every move sequence in data/*.json with chess.js.
//   node scripts/validate-data.mjs
// Checks: legal moves, valid arrow/square names, mates that claim to be mates,
// and (for king+pawn endgames) win/draw claims via scripts/kp-solver.mjs.
import { readFileSync, existsSync } from 'node:fs';
import { buildLine, parseArrow, isSquare, normMove } from '../js/lib/line.js';
import { solveKP, RESULT } from './kp-solver.mjs';

const root = new URL('..', import.meta.url).pathname;
const load = (f) => (existsSync(root + 'data/' + f) ? JSON.parse(readFileSync(root + 'data/' + f, 'utf8')) : []);
let errors = 0, checked = 0;
const fail = (where, msg) => { errors++; console.error(`✗ ${where}: ${msg}`); };

function checkMarks(where, obj) {
  for (const a of obj.arrows || []) { try { parseArrow(a); } catch (e) { fail(where, e.message); } }
  for (const s of obj.squares || []) if (!isSquare(s)) fail(where, `bad square "${s}"`);
}
function line(where, spec, { mate = false } = {}) {
  try {
    const frames = buildLine(spec);
    checked++;
    (spec.moves || []).map(normMove).forEach((m, i) => checkMarks(`${where} move ${i + 1}`, m));
    const last = frames[frames.length - 1];
    if (mate && !last.mate) fail(where, 'line claims checkmate but final position is not mate');
    return frames;
  } catch (e) { fail(where, e.message); return null; }
}
const uniq = (arr, where) => { const s = new Set(); arr.forEach((x) => { if (s.has(x.id)) fail(where, `duplicate id ${x.id}`); s.add(x.id); }); };

// ---- openings
const openings = load('openings.json');
uniq(openings, 'openings');
const LEVELS = ['beginner', 'intermediate', 'advanced'];
for (const o of openings) {
  const w = `opening ${o.id}`;
  for (const k of ['name', 'side', 'styles', 'difficulty', 'purpose', 'mainLine']) if (!o[k]) fail(w, `missing ${k}`);
  if (!LEVELS.includes(o.difficulty)) fail(w, `bad difficulty ${o.difficulty}`);
  line(`${w} main line`, { moves: o.mainLine });
  for (const t of o.traps || []) line(`${w} trap "${t.name}"`, { moves: t.moves }, { mate: /#$/.test(normMove(t.moves.at(-1)).san) });
  for (const v of o.variations || []) {
    line(`${w} variation "${v.name}"`, { moves: v.moves });
    if (v.level && !LEVELS.includes(v.level)) fail(w, `variation "${v.name}" bad level ${v.level}`);
  }
  for (const c of o.counters || []) line(`${w} counter "${c.name}"`, { moves: c.moves });
  for (const a of o.advanced || []) if (a.moves) line(`${w} advanced "${a.title}"`, { moves: a.moves });
}

// ---- tactics: solution must be legal; "Checkmate" goals must end in mate
const tactics = load('tactics.json');
uniq(tactics, 'tactics');
for (const t of tactics) {
  const w = `tactic ${t.id}`;
  checkMarks(w, t);
  if (t.solution.length % 2 === 0 && !/Win/.test(t.goal)) fail(w, 'solution should end with the solver\'s move');
  line(w, { fen: t.fen, setup: t.setup, moves: t.solution }, { mate: t.goal === 'Checkmate' });
}

// ---- strategy: static positions (fen or setup) + optional demo lines
const strategy = load('strategy.json');
uniq(strategy, 'strategy');
for (const s of strategy) {
  const w = `strategy ${s.id}`;
  checkMarks(w, s);
  line(w, { fen: s.fen, setup: s.setup, moves: s.moves || [] });
  if (!s.practice) fail(w, 'missing practice exercise');
  else for (const a of s.practice.answers || []) if (!isSquare(a)) fail(w, `practice answer "${a}" is not a square`);
}

// ---- endgames
const endgames = load('endgames.json');
uniq(endgames, 'endgames');
for (const e of endgames) {
  for (const [i, l] of (e.lines || []).entries()) {
    const w = `endgame ${e.id} line ${i + 1}${l.title ? ` "${l.title}"` : ''}`;
    checkMarks(w, l);
    const frames = line(w, { fen: l.fen, moves: l.moves }, { mate: !!l.mate });
    if (!frames || !l.expect) continue;
    // expect: { result: "win"|"draw"|"loss" } for the side to move at the start; checked on every frame
    try {
      const solved = solveKP(l.fen);
      const start = solved.root.val;
      if (RESULT[start] !== l.expect) fail(w, `solver says ${RESULT[start]} for side to move, data claims ${l.expect}`);
      // the side that is winning must never let the result slip during the demo line
      const winner = start === 1 ? l.fen.split(' ')[1] : start === -1 ? (l.fen.split(' ')[1] === 'w' ? 'b' : 'w') : null;
      frames.slice(1).forEach((f) => {
        const n = solved.get(f.fen);
        if (!n) return; // promotion frames leave the K+P domain
        const stm = f.fen.split(' ')[1];
        const forWinner = winner ? (stm === winner ? n.val : -n.val) : n.val;
        if (winner && forWinner !== 1) fail(w, `after ${f.ply}.${f.san} the win is lost (${RESULT[n.val]} for ${stm})`);
        if (!winner && n.val !== 0) fail(w, `after ${f.ply}.${f.san} the draw is lost`);
      });
    } catch (err) { fail(w, 'solver: ' + err.message); }
  }
}

// ---- attack lessons
const attack = load('attack.json');
uniq(attack, 'attack');
for (const a of attack) line(`attack ${a.id}`, { fen: a.fen, moves: a.moves }, { mate: /#$/.test(normMove(a.moves.at(-1)).san) });

// ---- endgame practice positions
for (const e of endgames) {
  const pr = e.practice;
  if (!pr) { fail(`endgame ${e.id}`, 'missing practice'); continue; }
  if (pr.fen) line(`endgame ${e.id} practice`, { fen: pr.fen, moves: [] });
  if (pr.mode === 'solver' && !e.lines[pr.line]?.expect) fail(`endgame ${e.id}`, 'solver practice needs an expect claim on its line');
}

// ---- featured games
const games = load('games.json');
uniq(games, 'games');
for (const g of games) line(`game ${g.id}`, { moves: g.moves }, { mate: /#$/.test(normMove(g.moves.at(-1)).san) });

console.log(`${errors ? '✗' : '✓'} ${checked} lines checked, ${errors} error(s) — ` +
  `${openings.length} openings, ${tactics.length} tactics, ${strategy.length} strategy, ${endgames.length} endgames`);
process.exit(errors ? 1 : 0);
