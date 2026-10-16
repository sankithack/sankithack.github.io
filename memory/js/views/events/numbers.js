// Speed Numbers, plus a factory reused by Binary Digits.
import { esc, randInt, chunk, $, $$ } from '../../utils.js';

/**
 * Build a digit-memorization event.
 * opts: id, name, blurb, tips, alphabet ('0123456789' | '01'), rowSize(cfg), levels, groupOptions, defaultGroup
 */
export function makeDigitEvent(opts) {
  const rowSize = opts.rowSize;
  return {
    id: opts.id,
    name: opts.name,
    blurb: opts.blurb,
    tips: opts.tips,
    levels: opts.levels,
    fields: [
      { key: 'count', label: 'Digits', type: 'number', min: 5, max: 2000, step: 1 },
      { key: 'group', label: 'Group size', hint: 'digits highlighted together', type: 'select', options: opts.groupOptions.map((g) => [g, String(g)]) },
      { key: 'view', label: 'Display', type: 'select', options: [['grid', 'Full grid'], ['step', 'One group at a time']] },
    ],
    defaults: { group: opts.defaultGroup, view: 'grid' },

    generate(cfg) {
      return Array.from({ length: cfg.count }, () => opts.alphabet[randInt(opts.alphabet.length)]).join('');
    },

    memorize(box, digits, cfg) {
      const rs = rowSize(cfg);
      const group = Number(cfg.group);
      const rows = chunk([...digits], rs).map((r) => r.join(''));
      // Flat list of groups with their row index, for focus navigation.
      const groups = [];
      rows.forEach((r, ri) => chunk([...r], group).forEach((g) => groups.push({ ri, text: g.join('') })));
      let focus = 0;

      const drawGrid = () => {
        let gi = 0;
        box.innerHTML = `<div class="card">
          <p class="small muted">Tap a group or use <kbd>←</kbd> <kbd>→</kbd> / <kbd>Space</kbd> to move the highlight, so you don’t lose your place.</p>
          <div class="digit-grid">${rows.map((r, ri) => `<div class="digit-row"><span class="rowno">${ri + 1}</span>${
            groups.filter((g) => g.ri === ri).map((g) => `<span class="digit-group ${gi === focus ? 'focus' : ''}" data-g="${gi++}">${g.text}</span>`).join('')
          }</div>`).join('')}</div></div>`;
      };
      const drawStep = () => {
        const g = groups[focus];
        box.innerHTML = `<div class="card step-view">
          <div class="muted small">Group ${focus + 1} of ${groups.length} · row ${g.ri + 1}</div>
          <div class="big">${g.text}</div>
          <div class="hint">${focus > 0 ? `previous: <span class="mono">${groups[focus - 1].text}</span>` : '&nbsp;'}</div>
          <div class="btn-row" style="justify-content:center;margin-top:16px">
            <button class="btn" data-step="-1" ${focus === 0 ? 'disabled' : ''}>← Back</button>
            <button class="btn primary big" data-step="1" ${focus === groups.length - 1 ? 'disabled' : ''}>Next <kbd>Space</kbd></button>
          </div></div>`;
      };
      const draw = () => (cfg.view === 'step' ? drawStep() : drawGrid());
      const move = (d) => { focus = Math.max(0, Math.min(groups.length - 1, focus + d)); draw(); };

      box.addEventListener('click', (e) => {
        const g = e.target.closest('[data-g]');
        if (g) { focus = Number(g.dataset.g); draw(); }
        const s = e.target.closest('[data-step]');
        if (s) move(Number(s.dataset.step));
      });
      const onKey = (e) => {
        if (e.key === 'ArrowRight' || e.key === ' ') { e.preventDefault(); move(1); }
        else if (e.key === 'ArrowLeft') { e.preventDefault(); move(-1); }
      };
      document.addEventListener('keydown', onKey);
      draw();
      return () => document.removeEventListener('keydown', onKey);
    },

    recall(box, digits, cfg) {
      const rs = rowSize(cfg);
      const rowLens = chunk([...digits], rs).map((r) => r.length);
      const allowed = opts.alphabet === '01' ? /[^01]/g : /\D/g;
      box.innerHTML = `<div class="card">
        <p class="small muted">Type each row. The cursor jumps to the next row when one is full. Leave unknown digits blank by stopping early. Only rows you attempt are scored strictly.</p>
        <div class="recall-rows">${rowLens.map((len, i) => `
          <div class="recall-row"><span class="rowno">${i + 1}</span>
            <input type="text" inputmode="numeric" autocomplete="off" maxlength="${len}" data-row="${i}" aria-label="Row ${i + 1} (${len} digits)" placeholder="${len} digits">
          </div>`).join('')}</div></div>`;
      const inputs = $$('input', box);
      inputs.forEach((inp, i) => {
        inp.addEventListener('input', () => {
          const clean = inp.value.replace(allowed, '');
          if (clean !== inp.value) inp.value = clean;
          if (inp.value.length >= rowLens[i] && inputs[i + 1]) inputs[i + 1].focus();
        });
        inp.addEventListener('keydown', (e) => {
          if (e.key === 'Enter' && inputs[i + 1]) { e.preventDefault(); inputs[i + 1].focus(); }
          if (e.key === 'Backspace' && !inp.value && inputs[i - 1]) { e.preventDefault(); inputs[i - 1].focus(); }
        });
      });
      inputs[0]?.focus();
      return { answers: () => inputs.map((i) => i.value) };
    },

    check(digits, answers, cfg) {
      const rows = chunk([...digits], rowSize(cfg));
      return {
        rows: rows.map((r, ri) => ({
          label: `Row ${ri + 1}`,
          cells: r.map((d, ci) => {
            const g = answers[ri]?.[ci] ?? '';
            return { e: d, g, ok: g === d };
          }),
        })),
      };
    },
  };
}

const lv = (count, memTime, recallTime, label = `${count} digits`) => ({ label, cfg: { count, memTime, recallTime } });

export default makeDigitEvent({
  id: 'numbers',
  name: 'Speed Numbers',
  blurb: 'Memorize a string of random digits, then write them back in order.',
  alphabet: '0123456789',
  rowSize: (cfg) => (Number(cfg.group) === 3 ? 18 : 20),
  groupOptions: [2, 3, 4, 6],
  defaultGroup: 2,
  levels: [
    lv(10, 60, 120),
    lv(16, 60, 120),
    lv(20, 60, 120),
    lv(30, 90, 180),
    lv(40, 120, 240),
    lv(60, 180, 360),
    lv(80, 240, 480),
    lv(100, 300, 600, '100 digits · 5 min'),
    lv(160, 300, 900, '160 digits · 5 min'),
  ],
  tips: `
    <ul>
      <li><b>Major System:</b> group in <b>2s</b>. Each pair is one image; put <b>2 images per locus</b> (4 digits).</li>
      <li><b>PAO:</b> group in <b>6s</b>. Person–action–object makes one scene per locus.</li>
      <li>Don’t revisit. One clear pass beats two blurry ones. Once you can do the pass reliably, use leftover time to review the whole route once.</li>
      <li>If an image won’t come instantly, use the <i>first thing</i> that appears, even if it isn’t your official image, and move on.</li>
    </ul>`,
});
