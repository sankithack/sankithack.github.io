// Opening tree: merge every line of an opening into one move trie.
import { normMove } from './line.js';

/** lines: [{ name, kind, moves }] → root node { children: Map<san, node>, lines: [...] } */
export function buildTree(lines) {
  const root = { san: null, children: new Map(), lines: [], ends: [] };
  for (const l of lines) {
    let node = root;
    root.lines.push(l);
    for (const m of l.moves) {
      const san = normMove(m).san.replace(/[!?]+$/, '');
      if (!node.children.has(san)) node.children.set(san, { san, children: new Map(), lines: [], ends: [], note: null });
      node = node.children.get(san);
      node.lines.push(l);
      if (!node.note && normMove(m).note) node.note = normMove(m).note;
    }
    node.ends.push(l);
  }
  return root;
}

/** Follow a path of SAN moves from the root. */
export function walk(root, path) {
  let node = root;
  for (const san of path) { node = node.children.get(san); if (!node) return null; }
  return node;
}

export function linesOf(o) {
  return [
    { name: 'Main line', kind: 'main', moves: o.mainLine },
    ...o.variations.map((v) => ({ name: v.name, kind: 'variation', moves: v.moves })),
    ...o.traps.map((t) => ({ name: t.name, kind: 'trap', moves: t.moves })),
    ...o.counters.map((c) => ({ name: c.name, kind: 'counter', moves: c.moves })),
    ...(o.advanced || []).filter((a) => a.moves).map((a) => ({ name: a.title, kind: 'advanced', moves: a.moves })),
  ];
}
