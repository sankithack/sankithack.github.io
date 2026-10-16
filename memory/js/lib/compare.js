// Scoring and the side-by-side "correct vs. yours" comparison shared by all events.
//
// rows: [{ label, cells: [{ e: expected, g: given, ok: bool, text?: bool }] }]
import { esc } from '../utils.js';

const blank = (c) => c.g === '' || c.g == null;

/**
 * mode 'rows' (default): championship row scoring when strict.
 *   Perfect row = full points, one mistake = half (rounded down), more = 0.
 *   Untouched rows score 0; trailing blanks in the last attempted row are not errors
 *   (you are only marked on what you attempted).
 * mode 'firstError': strict score stops at the first mistake (spoken numbers).
 * mode 'plain': every correct item scores even when strict (names, dates).
 * Accuracy is always plain cells-correct / cells-total and drives level unlocks.
 */
export function scoreRows(rows, { strict = false, mode = 'rows' } = {}) {
  const cells = rows.flatMap((r) => r.cells);
  const total = cells.length;
  const raw = cells.filter((c) => c.ok).length;
  let score = raw;

  if (!strict || mode === 'plain') {
    // score stays raw
  } else if (mode === 'firstError') {
    score = 0;
    for (const c of cells) { if (!c.ok) break; score++; }
  } else {
    let lastAttempted = -1;
    rows.forEach((r, i) => { if (r.cells.some((c) => !blank(c))) lastAttempted = i; });
    score = 0;
    rows.forEach((r, i) => {
      if (i > lastAttempted) return;
      let cs = r.cells;
      if (i === lastAttempted) {
        let end = cs.length;
        while (end > 0 && blank(cs[end - 1])) end--;
        cs = cs.slice(0, end);
      }
      const errors = cs.filter((c) => !c.ok).length;
      if (errors === 0) score += cs.length;
      else if (errors === 1) score += Math.floor(cs.length / 2);
    });
  }
  return { score, raw, total, accuracy: total ? raw / total : 0 };
}

export function comparisonHTML(rows) {
  return `<div class="cmp">${rows.map((r) => {
    const pass = r.cells.every((c) => c.ok);
    const cell = (c, which) => {
      const v = which === 'e' ? c.e : c.g;
      const cls = which === 'e' ? (c.ok ? 'ok' : '') : c.ok ? 'ok' : blank(c) ? 'bad empty' : 'bad';
      return `<span class="cmp-cell ${cls} ${c.text ? 'text' : ''}">${blank({ g: v }) ? '·' : esc(v)}</span>`;
    };
    return `<div class="cmp-row ${pass ? 'pass' : ''}">
      <span class="lbl">${r.labelHTML || esc(r.label)}</span>
      <div class="cmp-line"><span class="tag">correct</span>${r.cells.map((c) => cell(c, 'e')).join('')}</div>
      <div class="cmp-line"><span class="tag">yours</span>${r.cells.map((c) => cell(c, 'g')).join('')}</div>
    </div>`;
  }).join('')}</div>`;
}
