// Random Words: memorize a numbered list of concrete nouns in order.
import { WORDS } from '../../data/words.js';
import { esc, sample, chunk, norm, $$ } from '../../utils.js';

const lv = (count, memTime, recallTime) => ({ label: `${count} words`, cfg: { count, memTime, recallTime } });
const ROW = 10;

export default {
  id: 'words',
  name: 'Random Words',
  blurb: 'A numbered list of random words. Recall them in the exact order.',
  levels: [lv(10, 90, 150), lv(15, 120, 180), lv(20, 150, 240), lv(25, 180, 300), lv(30, 240, 360), lv(40, 300, 420), lv(50, 300, 480)],
  fields: [{ key: 'count', label: 'Words', type: 'number', min: 3, max: 200 }],
  defaults: {},
  tips: `
    <ul>
      <li>Put <b>one word per locus</b> to start; later try two. Make each word <i>do something</i> to the locus.</li>
      <li>Order matters: a word in the wrong position is wrong. Your palace gives you the order for free.</li>
      <li>Spelling counts, though capital letters don’t. If you remember the image but not the exact word (e.g. “sofa” vs “couch”), look at the original more carefully next time.</li>
    </ul>`,

  generate(cfg) {
    return sample(WORDS, Math.min(cfg.count, WORDS.length));
  },

  memorize(box, words) {
    box.innerHTML = `<div class="card"><div class="word-cols">${words.map((w, i) => `<div class="w"><b>${i + 1}</b>${esc(w)}</div>`).join('')}</div></div>`;
  },

  recall(box, words) {
    box.innerHTML = `<div class="card"><div class="word-inputs">${words.map((_, i) => `
      <label><span>${i + 1}</span><input type="text" data-i="${i}" autocomplete="off" autocapitalize="off" spellcheck="false" aria-label="Word ${i + 1}"></label>`).join('')}</div></div>`;
    const inputs = $$('input', box);
    inputs.forEach((inp, k) => inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') inputs[k + 1]?.focus(); }));
    inputs[0]?.focus();
    return { answers: () => inputs.map((i) => i.value.trim()) };
  },

  check(words, answers) {
    return {
      rows: chunk(words, ROW).map((row, ri) => ({
        label: `${ri * ROW + 1}–${ri * ROW + row.length}`,
        cells: row.map((w, k) => {
          const g = answers[ri * ROW + k] || '';
          return { e: w, g, ok: norm(g) === norm(w), text: true };
        }),
      })),
    };
  },
};
