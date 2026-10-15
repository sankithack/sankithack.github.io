// Fast exhaustive solver for king + pawn endings (no other pieces).
//   node scripts/kp-solver.mjs "<fen>" ...
// Used by validate-data.mjs to check endgame claims ("this is a win", "this is a draw").
// Simplifications: promotion = win for the promoting side, unless the new queen can be taken
// at once by the enemy king (then the capture is played out) or the promotion stalemates.
// En passant is ignored.
const FILES = 'abcdefgh';
const sq = (s) => FILES.indexOf(s[0]) + 8 * (Number(s[1]) - 1);
const name = (i) => FILES[i % 8] + (Math.floor(i / 8) + 1);
const adj = (a, b) => Math.max(Math.abs((a % 8) - (b % 8)), Math.abs((a >> 3) - (b >> 3))) <= 1;
const KD = [-9, -8, -7, -1, 1, 7, 8, 9];

function parse(fen) {
  const [board, stm] = fen.split(' ');
  const st = { w: { k: -1, p: [] }, b: { k: -1, p: [] }, stm };
  board.split('/').forEach((row, ri) => {
    let f = 0;
    for (const ch of row) {
      if (/\d/.test(ch)) { f += Number(ch); continue; }
      const i = f + 8 * (7 - ri);
      const side = ch === ch.toUpperCase() ? 'w' : 'b';
      const t = ch.toLowerCase();
      if (t === 'k') st[side].k = i;
      else if (t === 'p') st[side].p.push(i);
      else throw new Error('kp-solver only handles kings and pawns: ' + fen);
      f++;
    }
  });
  return st;
}
const keyOf = (st) => `${st.stm}${st.w.k},${st.b.k}|${[...st.w.p].sort((a, b) => a - b)}|${[...st.b.p].sort((a, b) => a - b)}`;
const pawnAttacks = (side, p, target) =>
  p.some((s) => { const d = side === 'w' ? 8 : -8; return (s % 8 > 0 && s + d - 1 === target) || (s % 8 < 7 && s + d + 1 === target); });

function legalAfter(st, mover) {
  const opp = mover === 'w' ? 'b' : 'w';
  if (adj(st.w.k, st.b.k)) return false;
  return !pawnAttacks(opp, st[opp].p, st[mover].k);
}
const inCheck = (st) => pawnAttacks(st.stm === 'w' ? 'b' : 'w', st[st.stm === 'w' ? 'b' : 'w'].p, st[st.stm].k);
const clone = (st) => ({ w: { k: st.w.k, p: [...st.w.p] }, b: { k: st.b.k, p: [...st.b.p] }, stm: st.stm });

function moves(st) {
  const me = st.stm, op = me === 'w' ? 'b' : 'w';
  const occ = new Set([st.w.k, st.b.k, ...st.w.p, ...st.b.p]);
  const out = [];
  const push = (ns, san, promo) => { if (legalAfter(ns, me)) { ns.stm = op; out.push({ st: ns, san, promo }); } };
  const k = st[me].k;
  for (const d of KD) {
    const t = k + d;
    if (t < 0 || t > 63 || !adj(k, t) || t === k) continue;
    if (st[me].p.includes(t) || t === st[op].k) continue;
    const ns = clone(st);
    const cap = ns[op].p.indexOf(t);
    if (cap >= 0) ns[op].p.splice(cap, 1);
    ns[me].k = t;
    push(ns, 'K' + (cap >= 0 ? 'x' : '') + name(t));
  }
  const dir = me === 'w' ? 8 : -8, startRank = me === 'w' ? 1 : 6, lastRank = me === 'w' ? 7 : 0;
  st[me].p.forEach((s, idx) => {
    const add = (t, cap) => {
      const ns = clone(st);
      ns[me].p.splice(idx, 1);
      if (cap) ns[op].p.splice(ns[op].p.indexOf(t), 1);
      const promo = t >> 3 === lastRank;
      if (!promo) ns[me].p.push(t);
      const san = (cap ? FILES[s % 8] + 'x' : '') + name(t) + (promo ? '=Q' : '');
      push(ns, san, promo ? t : undefined);
    };
    const f = s + dir;
    if (!occ.has(f)) {
      add(f, false);
      if (s >> 3 === startRank && !occ.has(f + dir)) add(f + dir, false);
    }
    for (const df of [-1, 1]) {
      const t = f + df;
      if ((s % 8) + df < 0 || (s % 8) + df > 7) continue;
      if (st[op].p.includes(t)) add(t, true);
    }
  });
  return out;
}

export function solveKP(rootFen, maxNodes = 3_000_000) {
  const nodes = new Map();
  const root = parse(rootFen);
  const stack = [root];
  while (stack.length) {
    const st = stack.pop();
    const k = keyOf(st);
    if (nodes.has(k)) continue;
    if (nodes.size > maxNodes) throw new Error('solver node limit');
    const node = { kids: [], val: null, dtm: 0 };
    nodes.set(k, node);
    const ms = moves(st);
    if (!ms.length) { node.val = inCheck(st) ? -1 : 0; continue; }
    if (!st.w.p.length && !st.b.p.length) { node.val = 0; continue; }
    for (const m of ms) {
      if (m.promo !== undefined) {
        const me = st.stm, ns = m.st, opK = ns[ns.stm].k;
        const defended = adj(ns[me].k, m.promo) || pawnAttacks(me, ns[me].p, m.promo);
        if (adj(opK, m.promo) && !defended) {
          const after = clone(ns); after[after.stm].k = m.promo; after.stm = me;
          if (!adj(after.w.k, after.b.k)) { node.kids.push({ san: m.san, cap: keyOf(after), capSan: 'Kx' + name(m.promo) }); stack.push(after); continue; }
        }
        node.kids.push({ san: m.san, term: -1 });
      } else { node.kids.push({ san: m.san, k: keyOf(m.st) }); stack.push(m.st); }
    }
  }
  // value of a kid from the kid's side-to-move perspective; a "cap" kid is the opponent forced to recapture
  const kv = (kid) => {
    if (kid.term !== undefined) return { val: kid.term, dtm: 0 };
    if (kid.cap) { const n = nodes.get(kid.cap); return { val: n.val === null ? null : -n.val, dtm: n.dtm + 1 }; }
    return nodes.get(kid.k);
  };
  let changed = true;
  while (changed) {
    changed = false;
    const ups = [];
    for (const n of nodes.values()) {
      if (n.val !== null) continue;
      let win = Infinity, allWin = true, maxD = 0;
      for (const kid of n.kids) {
        const v = kv(kid);
        if (v.val === -1) win = Math.min(win, v.dtm);
        if (v.val !== 1) allWin = false; else maxD = Math.max(maxD, v.dtm);
      }
      if (win < Infinity) ups.push([n, 1, win + 1]);
      else if (allWin) ups.push([n, -1, maxD + 1]);
    }
    for (const [n, v, d] of ups) { n.val = v; n.dtm = d; changed = true; }
  }
  for (const n of nodes.values()) if (n.val === null) n.val = 0;

  const get = (fen) => { try { return nodes.get(keyOf(parse(fen))); } catch { return null; } };
  function pv(fen, len = 40) {
    const out = [];
    let n = get(fen);
    while (n && n.kids.length && out.length < len) {
      let best = null;
      for (const kid of n.kids) {
        const v = kv(kid);
        const score = n.val === 1 ? (v.val === -1 ? -v.dtm : -1e9) : n.val === -1 ? v.dtm : v.val === 0 ? 0 : -1e9;
        if (!best || score > best.score) best = { kid, score };
      }
      out.push(best.kid.san);
      if (best.kid.term !== undefined) break;
      if (best.kid.cap) { out.push(best.kid.capSan); n = nodes.get(best.kid.cap); } else n = nodes.get(best.kid.k);
    }
    return out;
  }
  return { root: get(rootFen), get, pv, size: nodes.size, nodes, keyOf, parse };
}

export const RESULT = { 1: 'win', 0: 'draw', [-1]: 'loss' };

if (process.argv[1] && process.argv[1].endsWith('kp-solver.mjs')) {
  for (const fen of process.argv.slice(2)) {
    const t = Date.now();
    const r = solveKP(fen);
    console.log(`${fen}\n  ${RESULT[r.root.val]} for side to move (dtm ${r.root.dtm}) nodes=${r.size} ${Date.now() - t}ms\n  PV: ${r.pv(fen).join(' ')}`);
  }
}
