// CLI:  node scripts/kp-solver.mjs "<fen>" ...   (the solver itself lives in js/lib/kp-solver.js)
import { solveKP, RESULT } from '../js/lib/kp-solver.js';
export { solveKP, RESULT };

if (process.argv[1] && process.argv[1].endsWith('kp-solver.mjs')) {
  for (const fen of process.argv.slice(2)) {
    const t = Date.now();
    const r = solveKP(fen);
    console.log(`${fen}\n  ${RESULT[r.root.val]} for side to move (dtm ${r.root.dtm}) nodes=${r.size} ${Date.now() - t}ms\n  PV: ${r.pv(fen).join(' ')}`);
  }
}
