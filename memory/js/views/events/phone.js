// Phone Numbers: realistic North American 10-digit numbers, optionally tied to names.
import { FIRST_NAMES, LAST_NAMES } from '../../data/names.js';
import { esc, randInt, sample, shuffle, $$ } from '../../utils.js';

const lv = (count, memTime, recallTime) => ({ label: `${count} number${count > 1 ? 's' : ''}`, cfg: { count, memTime, recallTime } });

// NANP: area code and exchange start 2–9 and aren't N11; avoid 555 in the exchange.
function nxx(avoid555) {
  for (;;) {
    const s = `${2 + randInt(8)}${randInt(10)}${randInt(10)}`;
    if (s.slice(1) === '11' || (avoid555 && s === '555')) continue;
    return s;
  }
}
const makeNumber = () => nxx(false) + nxx(true) + String(randInt(10000)).padStart(4, '0');
const fmt = (d) => `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;

export default {
  id: 'phone',
  name: 'Phone Numbers',
  blurb: 'Realistic 10-digit phone numbers, optionally with a person’s name attached. A practical skill as well as a sport.',
  levels: [lv(1, 30, 60), lv(2, 60, 90), lv(3, 90, 120), lv(4, 120, 150), lv(6, 150, 210), lv(8, 210, 270), lv(10, 240, 300)],
  fields: [
    { key: 'count', label: 'Numbers', type: 'number', min: 1, max: 30 },
    { key: 'names', label: 'Attach names (recall in shuffled order)', type: 'checkbox' },
  ],
  defaults: { names: true },
  tips: `
    <ul>
      <li>A 10-digit number is 5 Major images (or 1 PAO scene + 2 images). Use <b>one locus per number</b>, or a mini-journey through the person’s house.</li>
      <li>With names: start the scene with an image for the <b>person’s name</b> (the same trick as names &amp; faces), then let that character interact with the number images.</li>
      <li>Area codes repeat in real life. Learn images for the ones you meet often.</li>
    </ul>`,

  generate(cfg) {
    const firsts = sample(FIRST_NAMES, cfg.count);
    const lasts = sample(LAST_NAMES, cfg.count);
    const seen = new Set();
    return Array.from({ length: cfg.count }, (_, i) => {
      let d;
      do d = makeNumber(); while (seen.has(d));
      seen.add(d);
      return { name: `${firsts[i % firsts.length]} ${lasts[i % lasts.length]}`, digits: d };
    });
  },

  memorize(box, items, cfg) {
    box.innerHTML = `<div class="card"><div class="phone-list">${items.map((it, i) => `
      <div class="phone-item"><span class="who">${cfg.names ? esc(it.name) : `Number ${i + 1}`}</span><span class="num">${fmt(it.digits)}</span></div>`).join('')}</div></div>`;
  },

  recall(box, items, cfg) {
    const order = cfg.names ? shuffle(items.map((_, i) => i)) : items.map((_, i) => i);
    box.innerHTML = `<div class="card">
      <p class="small muted">${cfg.names ? 'The names are in a new order. ' : ''}Type each number; spaces and dashes are ignored.</p>
      <div class="phone-list">${order.map((i) => `
        <div class="phone-item"><label class="who" for="ph-${i}">${cfg.names ? esc(items[i].name) : `Number ${i + 1}`}</label>
          <input id="ph-${i}" type="text" inputmode="tel" autocomplete="off" data-i="${i}" placeholder="(___) ___-____"></div>`).join('')}</div></div>`;
    const inputs = $$('input', box);
    inputs.forEach((inp, k) => inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') inputs[k + 1]?.focus(); }));
    inputs[0]?.focus();
    return {
      answers: () => {
        const a = [];
        inputs.forEach((inp) => { a[Number(inp.dataset.i)] = inp.value.replace(/\D/g, '').slice(0, 10); });
        return a;
      },
    };
  },

  check(items, answers, cfg) {
    return {
      rows: items.map((it, i) => ({
        label: cfg.names ? it.name : `Number ${i + 1}`,
        cells: [...it.digits].map((d, k) => {
          const g = answers[i]?.[k] ?? '';
          return { e: d, g, ok: g === d };
        }),
      })),
    };
  },
};
