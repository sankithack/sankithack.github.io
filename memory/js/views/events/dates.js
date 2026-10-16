// Historic / Fictional Dates: link a 4-digit year to an event.
import { makeDates } from '../../data/dates.js';
import { esc, shuffle, $$ } from '../../utils.js';

const lv = (count, memTime, recallTime) => ({ label: `${count} dates`, cfg: { count, memTime, recallTime } });

export default {
  id: 'dates',
  name: 'Historic Dates',
  blurb: 'Memorize the year of each event. Recall shows the events in a new order. Fictional events (the competition format) or real history.',
  levels: [lv(5, 60, 120), lv(10, 120, 180), lv(15, 150, 240), lv(20, 210, 300), lv(25, 240, 360), lv(30, 300, 420), lv(40, 300, 480)],
  fields: [
    { key: 'count', label: 'Dates', type: 'number', min: 2, max: 100 },
    { key: 'kind', label: 'Events', type: 'select', options: [['fictional', 'Fictional (competition style)'], ['historic', 'Real history'], ['mixed', 'Mixed']] },
  ],
  defaults: { kind: 'fictional' },
  tips: `
    <ul>
      <li>Turn the year into images: <b>19</b>69 → you can usually drop the century and use one Major image for the last two digits (69 = <i>ship</i>), plus a marker for the century (e.g. the scene happens <i>on fire</i> for the 1900s, <i>underwater</i> for the 1800s…).</li>
      <li>Or use two images (19 + 69) for full precision.</li>
      <li>Link the year image with a keyword from the event: <i>“A singing cactus wins the lottery”</i> + ship → a cactus singing on the deck of a ship, waving a lottery ticket.</li>
      <li>No palace is needed: the event text is your cue.</li>
    </ul>`,

  generate(cfg) {
    return makeDates(cfg.count, cfg.kind);
  },

  memorize(box, items) {
    box.innerHTML = `<div class="card"><div class="date-list">${items.map((d) => `
      <div class="date-item"><span class="yr">${d.year}</span><span>${esc(d.event)}</span></div>`).join('')}</div></div>`;
  },

  recall(box, items) {
    const order = shuffle(items.map((_, i) => i));
    box.innerHTML = `<div class="card"><div class="date-list">${order.map((i) => `
      <div class="date-item"><input type="text" inputmode="numeric" maxlength="4" data-i="${i}" placeholder="year" autocomplete="off" aria-label="Year for ${esc(items[i].event)}"><span>${esc(items[i].event)}</span></div>`).join('')}</div></div>`;
    const inputs = $$('input', box);
    inputs.forEach((inp, k) => {
      inp.addEventListener('input', () => {
        inp.value = inp.value.replace(/\D/g, '');
        if (inp.value.length === 4) inputs[k + 1]?.focus();
      });
    });
    inputs[0]?.focus();
    return {
      answers: () => {
        const a = [];
        inputs.forEach((inp) => { a[Number(inp.dataset.i)] = inp.value; });
        return a;
      },
    };
  },

  check(items, answers) {
    return {
      mode: 'plain',
      rows: items.map((d, i) => ({
        label: d.event,
        cells: [{ e: d.year, g: answers[i] || '', ok: answers[i] === d.year }],
      })),
    };
  },
};
