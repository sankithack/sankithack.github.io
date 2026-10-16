// Speed Cards: memorize a shuffled (partial) deck, then rebuild the order.
import { DECK, cardHTML, cardImage, cardInfo, cardPaoFor } from '../../data/cards.js';
import { settings } from '../../storage.js';
import { esc, sample, chunk, $, $$ } from '../../utils.js';

const lv = (count, memTime, recallTime) => ({ label: count === 52 ? 'Full deck' : `${count} cards`, cfg: { count, memTime, recallTime } });
const short = (code) => { const { rank, suit } = cardInfo(code); return rank + suit.sym; };
const hint = (code) => (settings().cardMode === 'pao' ? (({ p, a, o }) => `${p} · ${a} · ${o}`)(cardPaoFor(code)) : cardImage(code));

export default {
  id: 'cards',
  name: 'Speed Cards',
  blurb: 'Memorize the order of a shuffled deck, then rebuild it. Start with a handful of cards and work up to all 52.',
  levels: [lv(5, 60, 120), lv(10, 90, 180), lv(15, 120, 240), lv(20, 150, 300), lv(26, 180, 360), lv(39, 240, 420), lv(52, 300, 600)],
  fields: [
    { key: 'count', label: 'Cards', type: 'number', min: 2, max: 52 },
    { key: 'view', label: 'Display', type: 'select', options: [['step', 'One card at a time'], ['pair', 'Two at a time'], ['spread', 'All cards']] },
    { key: 'hints', label: 'Show my card images (training wheels)', type: 'checkbox' },
  ],
  defaults: { view: 'step', hints: false },
  tips: `
    <ul>
      <li>Look at the card, see its image, place it at the next locus. <b>Two cards per locus</b> is the standard: make the images interact.</li>
      <li>Flip through at a steady rhythm. Don’t go back unless you really lost an image.</li>
      <li>Use <b>training wheels</b> while you’re still learning your card list, then switch them off.</li>
      <li>During recall, walk your palace and tap cards in order. Tap a placed card to remove it.</li>
    </ul>`,

  generate(cfg) {
    return sample(DECK, cfg.count);
  },

  memorize(box, cards, cfg) {
    const per = cfg.view === 'pair' ? 2 : 1;
    let i = 0;
    const draw = () => {
      if (cfg.view === 'spread') {
        box.innerHTML = `<div class="card"><div class="card-fan">${cards.map((c, k) => `<div class="center">${cardHTML(c, { size: 'md' })}<div class="small muted">${k + 1}</div>${cfg.hints ? `<div class="small">${esc(hint(c))}</div>` : ''}</div>`).join('')}</div></div>`;
        return;
      }
      const shown = cards.slice(i, i + per);
      box.innerHTML = `<div class="card card-step">
        <div class="muted small">Card ${i + 1}${per > 1 && shown.length > 1 ? `–${i + shown.length}` : ''} of ${cards.length} · locus ${Math.floor(i / 2) + 1}</div>
        <div class="row" style="justify-content:center">${shown.map((c) => cardHTML(c, { size: 'lg' })).join('')}</div>
        <div class="card-image-hint">${cfg.hints ? shown.map((c) => esc(hint(c))).join(' + ') : ''}</div>
        <div class="btn-row" style="justify-content:center">
          <button class="btn" data-step="-1" ${i === 0 ? 'disabled' : ''}>← Back</button>
          <button class="btn primary big" data-step="1" ${i + per >= cards.length ? 'disabled' : ''}>Next <kbd>Space</kbd></button>
        </div></div>`;
    };
    const move = (d) => { i = Math.max(0, Math.min(cards.length - 1, i + d * per)); i -= i % per; draw(); };
    box.addEventListener('click', (e) => { const s = e.target.closest('[data-step]'); if (s) move(Number(s.dataset.step)); });
    const onKey = (e) => {
      if (e.key === 'ArrowRight' || e.key === ' ') { e.preventDefault(); move(1); }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); move(-1); }
    };
    document.addEventListener('keydown', onKey);
    draw();
    return () => document.removeEventListener('keydown', onKey);
  },

  recall(box, cards) {
    const pool = DECK.filter((c) => cards.includes(c)); // sorted by suit and rank
    const seq = [];
    box.innerHTML = `<div class="card">
        <div class="row between"><h3 class="mb0">Your order <span class="badge accent" id="cnt">0 / ${cards.length}</span></h3>
          <button class="btn small" id="undo">Undo</button></div>
        <p class="small muted">Tap cards below in the order you memorized. Tap a placed card to take it back out.</p>
        <div class="card-slots" id="slots"></div>
      </div>
      <div class="card" style="margin-top:12px"><h3>Cards</h3><div class="card-fan" id="pool">
        ${pool.map((c) => cardHTML(c, { size: 'sm', tag: 'button', attrs: `type="button" data-c="${c}"` })).join('')}
      </div></div>`;
    const draw = () => {
      $('#slots', box).innerHTML = seq.map((c, k) => `<span class="pos"><i>${k + 1}</i>${cardHTML(c, { size: 'sm', tag: 'button', attrs: `type="button" data-s="${k}"` })}</span>`).join('')
        || '<span class="muted small">Nothing placed yet</span>';
      $$('#pool [data-c]', box).forEach((b) => b.classList.toggle('used', seq.includes(b.dataset.c)));
      $('#cnt', box).textContent = `${seq.length} / ${cards.length}`;
    };
    $('#pool', box).onclick = (e) => {
      const b = e.target.closest('[data-c]');
      if (b && !seq.includes(b.dataset.c)) { seq.push(b.dataset.c); draw(); }
    };
    $('#slots', box).onclick = (e) => {
      const b = e.target.closest('[data-s]');
      if (b) { seq.splice(Number(b.dataset.s), 1); draw(); }
    };
    $('#undo', box).onclick = () => { seq.pop(); draw(); };
    draw();
    return { answers: () => [...seq] };
  },

  check(cards, answers) {
    const size = cards.length <= 13 ? cards.length : 13;
    return {
      rows: chunk(cards, size).map((row, ri) => ({
        label: `Cards ${ri * size + 1}–${ri * size + row.length}`,
        cells: row.map((c, k) => {
          const g = answers[ri * size + k];
          return { e: short(c), g: g ? short(g) : '', ok: g === c };
        }),
      })),
    };
  },
};
