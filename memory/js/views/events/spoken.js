// Spoken Numbers: digits read aloud once by speech synthesis; no visual display.
import { speakDigits, speechSupported } from '../../lib/speech.js';
import { settings } from '../../storage.js';
import { randInt, chunk, $, $$ } from '../../utils.js';

const lv = (count, recallTime) => ({ label: `${count} digits`, cfg: { count, recallTime } });
const ROW = 10;

export default {
  id: 'spoken',
  name: 'Spoken Numbers',
  blurb: 'Digits are read aloud once, one per second. No replays, no visuals, just your ears and your images.',
  untimedMemorize: true,
  levels: [lv(5, 60), lv(10, 90), lv(15, 120), lv(20, 150), lv(30, 210), lv(40, 270), lv(50, 300), lv(75, 420), lv(100, 600)],
  fields: [
    { key: 'count', label: 'Digits', type: 'number', min: 3, max: 500 },
    { key: 'rate', label: 'Speed', hint: 'digits per second', type: 'select', options: [[0.5, '0.5 / sec'], [0.75, '0.75 / sec'], [1, '1 / sec (competition)'], [1.5, '1.5 / sec'], [2, '2 / sec']] },
    { key: 'flash', label: 'Also flash digits on screen (practice aid)', type: 'checkbox' },
  ],
  get defaults() { return { rate: settings().speechRate, flash: false }; },
  tips: `
    <ul>
      <li>This event punishes hesitation: you can’t go back. Make each image <b>fast and simple</b>; the next digit is already coming.</li>
      <li>Group in pairs: as the second digit of a pair is spoken, see its Major image and drop it at the locus.</li>
      <li>In championship scoring you score digits <b>up to your first mistake</b>, so accuracy on the early digits matters most.</li>
      <li>Use headphones and a quiet room. If you lose track, keep going and try to rescue later images.</li>
    </ul>`,

  generate(cfg) {
    return Array.from({ length: cfg.count }, () => randInt(10)).join('');
  },

  memorize(box, digits, cfg, ctx) {
    const supported = speechSupported();
    box.innerHTML = `<div class="card listen">
      <div class="pulse" aria-hidden="true">🔊</div>
      <h2 id="status">Listen…</h2>
      <p class="muted" id="pos">Digit 0 of ${digits.length}</p>
      <div class="step-view"><div class="big" id="flash" style="min-height:1.1em">&nbsp;</div></div>
      ${supported ? '' : '<p class="callout warn">Your browser has no speech synthesis, so digits are flashed on screen instead.</p>'}
      <p class="small muted">Recall starts automatically when the reading ends.</p>
    </div>`;
    const flash = cfg.flash || !supported;
    let clearFlash;
    const stop = speakDigits(digits, {
      rate: Number(cfg.rate) || 1,
      voiceName: settings().voice,
      onDigit: (i, d) => {
        $('#pos', box).textContent = `Digit ${i + 1} of ${digits.length}`;
        if (flash) {
          $('#flash', box).textContent = d;
          clearTimeout(clearFlash);
          clearFlash = setTimeout(() => { const f = $('#flash', box); if (f) f.innerHTML = '&nbsp;'; }, 450 / (Number(cfg.rate) || 1));
        }
      },
      onEnd: () => ctx.done(),
    });
    return () => { stop(); clearTimeout(clearFlash); };
  },

  recall(box, digits) {
    const rows = chunk([...digits], ROW);
    box.innerHTML = `<div class="card">
      <p class="small muted">Type the digits in order, ${ROW} per row.</p>
      <div class="recall-rows">${rows.map((r, i) => `
        <div class="recall-row"><span class="rowno">${i * ROW + 1}</span>
          <input type="text" inputmode="numeric" autocomplete="off" maxlength="${r.length}" data-row="${i}" aria-label="Digits ${i * ROW + 1} to ${i * ROW + r.length}">
        </div>`).join('')}</div></div>`;
    const inputs = $$('input', box);
    inputs.forEach((inp, i) => inp.addEventListener('input', () => {
      inp.value = inp.value.replace(/\D/g, '');
      if (inp.value.length >= rows[i].length) inputs[i + 1]?.focus();
    }));
    inputs[0]?.focus();
    return { answers: () => inputs.map((i) => i.value) };
  },

  check(digits, answers) {
    return {
      mode: 'firstError',
      rows: chunk([...digits], ROW).map((r, ri) => ({
        label: `${ri * ROW + 1}–${ri * ROW + r.length}`,
        cells: r.map((d, k) => {
          const g = answers[ri]?.[k] ?? '';
          return { e: d, g, ok: g === d };
        }),
      })),
    };
  },
};
