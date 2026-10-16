// Names & Faces with photorealistic synthetic faces (see data/faces.js).
import { LAST_NAMES, namesFor } from '../../data/names.js';
import { FACES } from '../../data/faces.js';
import { esc, sample, shuffle, norm, $$ } from '../../utils.js';

export const faceImg = (p, cls = '') => `<img class="face-img ${cls}" src="${p.file}" alt="" width="224" height="224" decoding="async">`;

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
    const faces = sample(FACES, Math.min(cfg.count, FACES.length));
    const firsts = namesFor(faces.map((f) => f.femme));
    const lasts = sample(LAST_NAMES, faces.length);
    return faces.map((f, i) => ({ file: f.file, first: firsts[i], last: lasts[i] }));
  },

  memorize(box, people) {
    box.innerHTML = `<div class="card"><div class="faces">${people.map((p) => `
      <div class="face">${faceImg(p)}<div class="nm">${esc(p.first)}<br>${esc(p.last)}</div></div>`).join('')}</div></div>`;
  },

  recall(box, people) {
    const order = shuffle(people.map((_, i) => i));
    box.innerHTML = `<div class="card"><div class="faces">${order.map((i) => `
      <div class="face">${faceImg(people[i])}
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
        labelHTML: faceImg(p, 'mini'),
        cells: ['first', 'last'].map((f) => {
          const g = answers[i][f];
          return { e: p[f], g, ok: norm(g) === norm(p[f]), text: true };
        }),
      })),
    };
  },
};
