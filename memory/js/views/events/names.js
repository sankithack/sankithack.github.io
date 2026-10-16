// Names & Faces with generated avatars.
import { FIRST_NAMES, LAST_NAMES, FEMALE_NAMES } from '../../data/names.js';
import { avatarSVG } from '../../lib/avatar.js';
import { esc, randInt, sample, shuffle, norm, $$ } from '../../utils.js';

const lv = (count, memTime, recallTime) => ({ label: `${count} faces`, cfg: { count, memTime, recallTime } });

export default {
  id: 'names',
  name: 'Names & Faces',
  blurb: 'Memorize first and last names for a set of faces. At recall the faces appear in a different order.',
  levels: [lv(5, 90, 120), lv(8, 120, 180), lv(10, 150, 210), lv(15, 210, 300), lv(20, 300, 420), lv(25, 360, 480), lv(30, 420, 600)],
  fields: [{ key: 'count', label: 'Faces', type: 'number', min: 2, max: 60 }],
  defaults: {},
  tips: `
    <ul>
      <li>Pick <b>one feature</b> per face (hair, glasses, ears, smile) and attach an image for the first name to it.</li>
      <li>Add the last name as a second image in the same scene: <i>Rosa Fischer</i>, roses growing out of her curly hair with a fish flapping in them.</li>
      <li>Each first name and each last name scores one point, so if a surname won’t stick, secure the first name.</li>
      <li>Spelling counts, though capital letters don’t.</li>
    </ul>`,

  generate(cfg) {
    const n = Math.min(cfg.count, FIRST_NAMES.length);
    const firsts = sample(FIRST_NAMES, n);
    const lasts = sample(LAST_NAMES, n);
    const seeds = new Set();
    while (seeds.size < n) seeds.add(randInt(2 ** 31));
    return [...seeds].map((seed, i) => ({ seed, first: firsts[i], last: lasts[i], femme: FEMALE_NAMES.has(firsts[i]) }));
  },

  memorize(box, people) {
    box.innerHTML = `<div class="card"><div class="faces">${people.map((p) => `
      <div class="face">${avatarSVG(p.seed, p)}<div class="nm">${esc(p.first)}<br>${esc(p.last)}</div></div>`).join('')}</div></div>`;
  },

  recall(box, people) {
    const order = shuffle(people.map((_, i) => i));
    box.innerHTML = `<div class="card"><div class="faces">${order.map((i) => `
      <div class="face">${avatarSVG(people[i].seed, people[i])}
        <input type="text" data-i="${i}" data-f="first" placeholder="First name" autocomplete="off" autocapitalize="words" spellcheck="false" aria-label="First name">
        <input type="text" data-i="${i}" data-f="last" placeholder="Last name" autocomplete="off" autocapitalize="words" spellcheck="false" aria-label="Last name">
      </div>`).join('')}</div></div>`;
    const inputs = $$('input', box);
    inputs.forEach((inp, k) => inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') inputs[k + 1]?.focus(); }));
    inputs[0]?.focus();
    return {
      answers: () => {
        const a = people.map(() => ({ first: '', last: '' }));
        inputs.forEach((inp) => { a[Number(inp.dataset.i)][inp.dataset.f] = inp.value.trim(); });
        return a;
      },
    };
  },

  check(people, answers) {
    return {
      mode: 'plain',
      rows: people.map((p, i) => ({
        labelHTML: `<span style="display:inline-block;width:44px">${avatarSVG(p.seed, { size: 44, femme: p.femme })}</span>`,
        cells: ['first', 'last'].map((f) => {
          const g = answers[i][f];
          return { e: p[f], g, ok: norm(g) === norm(p[f]), text: true };
        }),
      })),
    };
  },
};
