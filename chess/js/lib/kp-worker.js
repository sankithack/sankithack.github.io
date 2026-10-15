// Web Worker: solves a king+pawn position once, then answers "how good is this position / best move" queries.
import { solveKP } from './kp-solver.js';

let solved = null;
self.onmessage = ({ data }) => {
  try {
    if (data.type === 'solve') {
      const t = Date.now();
      solved = solveKP(data.fen);
      self.postMessage({ id: data.id, ok: true, val: solved.root.val, ms: Date.now() - t });
    } else if (data.type === 'query') {
      const n = solved?.get(data.fen);
      self.postMessage({ id: data.id, ok: true, known: !!n, val: n?.val ?? null, dtm: n?.dtm ?? null, best: n ? solved.pv(data.fen, 1)[0] || null : null });
    }
  } catch (err) {
    self.postMessage({ id: data.id, ok: false, error: err.message });
  }
};
