// Editable image systems: Major 00–99, PAO 00–99, card images, card PAO.
import { DEFAULT_MAJOR, NUMBERS, majorImage } from '../data/major.js';
import { DEFAULT_PAO, paoFor } from '../data/pao.js';
import { DECK, DEFAULT_CARD_IMAGES, cardHTML, cardImage, cardPaoFor, defaultCardPao, cardInfo } from '../data/cards.js';
import { majorDecode } from '../lib/major.js';
import { db, update } from '../storage.js';
import { esc, toast, norm, $, $$ } from '../utils.js';

export const SYSTEMS = {
  major: { title: 'Major list 00–99', blurb: 'One image per two-digit number.', keys: NUMBERS, fields: ['img'] },
  pao: { title: 'PAO 00–99', blurb: 'Person, action and object for each number.', keys: NUMBERS, fields: ['p', 'a', 'o'] },
  cards: { title: 'Card images', blurb: 'One image for each of the 52 cards.', keys: DECK, fields: ['img'] },
  cardPao: { title: 'Card PAO', blurb: 'Person, action and object for each card.', keys: DECK, fields: ['p', 'a', 'o'] },
};

const LABELS = { img: 'Image', p: 'Person', a: 'Action', o: 'Object' };

function current(kind, key) {
  if (kind === 'major') return { img: majorImage(key) };
  if (kind === 'cards') return { img: cardImage(key) };
  if (kind === 'pao') return paoFor(key);
  return cardPaoFor(key);
}

function defaultsFor(kind, key) {
  if (kind === 'major') return { img: DEFAULT_MAJOR[Number(key)] };
  if (kind === 'cards') return { img: DEFAULT_CARD_IMAGES[key] };
  if (kind === 'pao') return DEFAULT_PAO[Number(key)];
  return defaultCardPao(key);
}

const isCustom = (kind, key) => Boolean(db().systems[kind][key]);

function majorCheck(key, word) {
  const d = majorDecode(word);
  return d === key
    ? '<span class="badge ok" title="Fits the Major System">✓</span>'
    : `<span class="badge warn" title="Spelling reads as ${esc(d || 'nothing')}. Fine if the pronunciation fits.">${esc(d || '–')}</span>`;
}

export function renderSystem(el, kind) {
  const sys = SYSTEMS[kind];
  if (!sys) {
    el.innerHTML = `<div class="card"><h1>Unknown list</h1><a href="#/learn">Back to Learn</a></div>`;
    return;
  }
  const isCard = kind === 'cards' || kind === 'cardPao';

  el.innerHTML = `
    <div class="crumbs"><a href="#/learn">← Learn</a></div>
    <div class="page-head"><h1>${esc(sys.title)}</h1><p>Edit any entry; it saves when you leave the field. Customized entries are highlighted.</p></div>
    <div class="card">
      <div class="row" style="margin-bottom:12px">
        <input type="search" id="filter" placeholder="Filter…" style="max-width:240px" aria-label="Filter">
        <span class="spacer"></span>
        <a class="btn small" href="#/train/${isCard ? 'cards' : 'numbers'}">Drill these →</a>
        <button class="btn small danger" id="resetAll">Reset all to defaults</button>
      </div>
      ${kind === 'major' ? '<p class="small muted">The badge shows the digits the spelling decodes to. A yellow badge is fine if the <i>pronunciation</i> fits (the checker only reads spelling).</p>' : ''}
      <div class="table-wrap">
        <table class="sys-table">
          <thead><tr><th>${isCard ? 'Card' : '#'}</th>${sys.fields.map((f) => `<th>${LABELS[f]}</th>`).join('')}${kind === 'major' ? '<th class="chk"></th>' : ''}<th></th></tr></thead>
          <tbody>${sys.keys.map((k) => rowHTML(kind, sys, k, isCard)).join('')}</tbody>
        </table>
      </div>
    </div>`;

  const tbody = $('tbody', el);

  tbody.addEventListener('change', (e) => {
    const input = e.target.closest('input[data-f]');
    if (!input) return;
    const tr = input.closest('tr');
    const key = tr.dataset.k;
    saveRow(kind, sys, key, tr);
  });

  tbody.addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-reset]');
    if (!btn) return;
    const tr = btn.closest('tr');
    const key = tr.dataset.k;
    update((d) => { delete d.systems[kind][key]; });
    tr.outerHTML = rowHTML(kind, sys, key, isCard);
    toast('Reset to default');
  });

  $('#filter', el).oninput = (e) => {
    const q = norm(e.target.value);
    $$('tr[data-k]', tbody).forEach((tr) => {
      const text = norm(tr.dataset.k + ' ' + $$('input', tr).map((i) => i.value).join(' ') + ' ' + (tr.dataset.name || ''));
      tr.classList.toggle('hidden', q && !text.includes(q));
    });
  };

  $('#resetAll', el).onclick = () => {
    if (!confirm(`Reset every entry in "${sys.title}" to the defaults? Your custom images in this list will be lost.`)) return;
    update((d) => { d.systems[kind] = {}; });
    renderSystem(el, kind);
    toast('List reset');
  };
}

function rowHTML(kind, sys, key, isCard) {
  const val = current(kind, key);
  const label = isCard ? `<span class="row" style="gap:6px;flex-wrap:nowrap">${cardHTML(key, { size: 'xs' })}</span>` : key;
  return `<tr data-k="${key}" ${isCard ? `data-name="${esc(cardInfo(key).name)}"` : ''} class="${isCustom(kind, key) ? 'custom' : ''}">
    <td>${label}</td>
    ${sys.fields.map((f) => `<td><input type="text" data-f="${f}" value="${esc(val[f])}" aria-label="${LABELS[f]} for ${key}"></td>`).join('')}
    ${kind === 'major' ? `<td class="chk">${majorCheck(key, val.img)}</td>` : ''}
    <td><button class="btn small ghost" data-reset title="Reset to default" aria-label="Reset ${key}" ${isCustom(kind, key) ? '' : 'disabled'}>↺</button></td>
  </tr>`;
}

function saveRow(kind, sys, key, tr) {
  const values = {};
  $$('input[data-f]', tr).forEach((i) => { values[i.dataset.f] = i.value.trim(); });
  const def = defaultsFor(kind, key);
  update((d) => {
    if (sys.fields.length === 1) {
      const v = values.img;
      if (!v || (def && v === def.img)) delete d.systems[kind][key];
      else d.systems[kind][key] = v;
    } else {
      // Store only fields that differ from the default.
      const base = def;
      const custom = {};
      for (const f of sys.fields) if (values[f] && values[f] !== base[f]) custom[f] = values[f];
      if (Object.keys(custom).length) d.systems[kind][key] = custom;
      else delete d.systems[kind][key];
    }
  });
  const custom = isCustom(kind, key);
  tr.classList.toggle('custom', custom);
  $('button[data-reset]', tr).disabled = !custom;
  if (kind === 'major') $('.chk', tr).innerHTML = majorCheck(key, values.img || DEFAULT_MAJOR[Number(key)]);
  toast('Saved');
}
