import { LESSONS, lessonById } from '../data/lessons.js';
import { MAJOR_RULES, NUMBERS, majorImage } from '../data/major.js';
import { paoFor } from '../data/pao.js';
import { DECK, cardHTML, cardImage, cardInfo } from '../data/cards.js';
import { WORDS } from '../data/words.js';
import { FIRST_NAMES, LAST_NAMES, FEMALE_NAMES } from '../data/names.js';
import { majorDecode } from '../lib/major.js';
import { avatarSVG } from '../lib/avatar.js';
import { db, update, logActivity } from '../storage.js';
import { esc, sample, shuffle, randInt, norm, $ } from '../utils.js';
import { renderSystem, SYSTEMS } from './systems.js';

export function render(el, params) {
  if (!params.length) return renderIndex(el);
  if (params[0] === 'systems') return renderSystem(el, params[1]);
  return renderLesson(el, params[0]);
}

function renderIndex(el) {
  const done = db().lessonsDone;
  el.innerHTML = `
    <div class="page-head"><h1>Learn</h1><p>Short lessons in the order competitors learn them. Each ends with a mini-exercise.</p></div>
    <div class="grid cols-2">
      ${LESSONS.map((l, i) => `
        <a class="card link" href="#/learn/${l.id}">
          <div class="row between"><span class="badge accent">Lesson ${i + 1}</span>
            ${done.includes(l.id) ? '<span class="badge ok">✓ Done</span>' : `<span class="badge">${l.minutes} min</span>`}</div>
          <h2 style="margin-top:10px">${esc(l.title)}</h2>
          <p class="muted mb0">${esc(l.summary)}</p>
        </a>`).join('')}
    </div>
    <h2 style="margin-top:32px">Your image systems</h2>
    <p class="muted">Customize the images you use. Changes are saved automatically and used everywhere.</p>
    <div class="grid cols-4">
      ${Object.entries(SYSTEMS).map(([k, s]) => `
        <a class="card link" href="#/learn/systems/${k}"><h3>${esc(s.title)}</h3><p class="small muted mb0">${esc(s.blurb)}</p></a>`).join('')}
    </div>`;
}

function renderLesson(el, id) {
  const lesson = lessonById(id);
  if (!lesson) {
    el.innerHTML = `<div class="card"><h1>Lesson not found</h1><a href="#/learn">All lessons</a></div>`;
    return;
  }
  const idx = LESSONS.indexOf(lesson);
  const prev = LESSONS[idx - 1];
  const next = LESSONS[idx + 1];
  const isDone = db().lessonsDone.includes(id);
  const body = lesson.body
    .replace('{{majorRules}}', majorRulesTable())
    .replace('{{majorRef}}', majorRefGrid());

  el.innerHTML = `
    <div class="crumbs"><a href="#/learn">← Learn</a></div>
    <div class="page-head"><h1>${esc(lesson.title)}</h1><p>${esc(lesson.summary)}</p></div>
    <article class="card lesson">${body}</article>
    <section class="card exercise" style="margin-top:16px" id="exercise"></section>
    <div class="row between" style="margin-top:16px">
      ${prev ? `<a class="btn ghost" href="#/learn/${prev.id}">← ${esc(prev.title)}</a>` : '<span></span>'}
      <button class="btn ${isDone ? '' : 'primary'}" id="done">${isDone ? '✓ Completed' : 'Mark lesson complete'}</button>
      ${next ? `<a class="btn ghost" href="#/learn/${next.id}">${esc(next.title)} →</a>` : '<span></span>'}
    </div>`;

  $('#done', el).onclick = () => {
    update((d) => { if (!d.lessonsDone.includes(id)) d.lessonsDone.push(id); });
    logActivity('lesson', id);
    const b = $('#done', el);
    b.textContent = '✓ Completed';
    b.classList.remove('primary');
  };

  const ex = EXERCISES[lesson.exercise];
  if (ex) runExercise($('#exercise', el), ex);
}

function majorRulesTable() {
  return `<div class="table-wrap"><table><thead><tr><th>Digit</th><th>Sounds</th><th>Memory hook</th></tr></thead><tbody>
    ${MAJOR_RULES.map(([d, s, h]) => `<tr><td class="mono"><b>${d}</b></td><td>${esc(s)}</td><td class="muted">${esc(h)}</td></tr>`).join('')}
  </tbody></table></div>`;
}

function majorRefGrid() {
  return `<div class="ref-grid">${NUMBERS.map((n) => `<div><b>${n}</b>${esc(majorImage(n))}</div>`).join('')}</div>`;
}

/* ---------- Mini-exercises ----------
 * Each generator returns { title, intro, study?: html, items: [{cue, answer, accept?}] }.
 * With `study`, the user memorizes first; otherwise it is a direct quiz.
 */
const SAMPLE_LOCI = ['Front door', 'Doormat', 'Coat hook', 'Hallway mirror', 'Kitchen sink', 'Fridge', 'Stove', 'Dining table', 'Sofa', 'Television'];

const EXERCISES = {
  palace() {
    const own = db().palaces.find((p) => p.loci.length >= 8);
    const loci = (own ? own.loci : SAMPLE_LOCI).slice(0, 8);
    const words = sample(WORDS, loci.length);
    return {
      title: 'Try it: 8 words in a palace',
      intro: own
        ? `Using your palace <b>${esc(own.name)}</b>. Picture each word interacting with its locus, then test yourself.`
        : 'Using a sample home palace (build your own in the <a href="#/palaces">Palace Builder</a>). Picture each word interacting with its locus, then test yourself.',
      study: `<ol class="mb0">${loci.map((l, i) => `<li><span class="muted">${esc(l)}:</span> <b>${esc(words[i])}</b></li>`).join('')}</ol>`,
      items: loci.map((l, i) => ({ cue: esc(l), answer: words[i] })),
    };
  },
  pairs() {
    const w = sample(WORDS, 16);
    const pairs = Array.from({ length: 8 }, (_, i) => [w[i * 2], w[i * 2 + 1]]);
    return {
      title: 'Try it: link 8 word pairs',
      intro: 'For each pair, imagine one crazy scene where the two things interact. Then you’ll be given the first word.',
      study: `<div class="word-cols">${pairs.map(([a, b]) => `<div class="w">${esc(a)} — <b>${esc(b)}</b></div>`).join('')}</div>`,
      items: shuffle(pairs).map(([a, b]) => ({ cue: esc(a), answer: b })),
    };
  },
  major() {
    const nums = sample(NUMBERS, 10);
    return {
      title: 'Try it: encode 10 numbers',
      intro: 'Type a word for each number using the Major System. Any word that fits the sounds counts. The checker reads spelling, so give it a moment’s thought for tricky words.',
      items: nums.map((n) => ({
        cue: `<span class="mono" style="font-size:1.4rem">${n}</span>`,
        answer: majorImage(n),
        accept: (g) => majorDecode(g) === n,
        explain: (g) => g ? `“${esc(g)}” reads as ${majorDecode(g) || 'no digits'}` : '',
      })),
    };
  },
  pao() {
    const make = () => Array.from({ length: 6 }, () => randInt(10)).join('');
    const nums = [make(), make()];
    const scene = (n) => {
      const [a, b, c] = [n.slice(0, 2), n.slice(2, 4), n.slice(4, 6)];
      return `${esc(paoFor(a).p)} ${esc(paoFor(b).a)} a ${esc(paoFor(c).o)}`;
    };
    return {
      title: 'Try it: two 6-digit numbers with PAO',
      intro: 'Each number is shown with its PAO scene from your list. Picture the scene, then write the numbers back.',
      study: nums.map((n, i) => `<p><b>Number ${i + 1}:</b> <span class="mono" style="font-size:1.3rem">${n}</span><br><span class="muted">${scene(n)}</span></p>`).join(''),
      items: nums.map((n, i) => ({ cue: `Number ${i + 1}`, answer: n, accept: (g) => g.replace(/\D/g, '') === n })),
    };
  },
  cards() {
    const cards = sample(DECK, 8);
    return {
      title: 'Try it: name your card images',
      intro: 'Type the image for each card from your card list (shown on the right of the results). Can you get all 8?',
      items: cards.map((c) => ({ cue: `${cardHTML(c, { size: 'xs' })} <span class="muted small">${esc(cardInfo(c).name)}</span>`, answer: cardImage(c) })),
    };
  },
  names() {
    const people = Array.from({ length: 5 }, () => ({ seed: randInt(1e9), first: '', last: '' }));
    const firsts = sample(FIRST_NAMES, 5);
    const lasts = sample(LAST_NAMES, 5);
    people.forEach((p, i) => { p.first = firsts[i]; p.last = lasts[i]; p.femme = FEMALE_NAMES.has(firsts[i]); });
    return {
      title: 'Try it: 5 names and faces',
      intro: 'Pick a feature on each face, turn the name into an image, and link them. Then type the full names (the order will change).',
      study: `<div class="faces">${people.map((p) => `<div class="face">${avatarSVG(p.seed, p)}<div class="nm">${esc(p.first)} ${esc(p.last)}</div></div>`).join('')}</div>`,
      items: shuffle(people).map((p) => ({
        cue: `<span style="display:inline-block;width:72px;vertical-align:middle">${avatarSVG(p.seed, p)}</span>`,
        answer: `${p.first} ${p.last}`,
      })),
    };
  },
};

function runExercise(box, gen) {
  const ex = gen();
  const showRecall = () => {
    box.innerHTML = `
      <h2>${esc(ex.title)}</h2>
      ${ex.study ? '<p class="muted">Now recall:</p>' : `<p class="muted">${ex.intro}</p>`}
      <form class="recall-rows" autocomplete="off">
        ${ex.items.map((it, i) => `
          <div class="recall-row">
            <span class="rowno">${i + 1}.</span>
            <div style="min-width:6em">${it.cue}</div>
            <input type="text" data-i="${i}" autocapitalize="off" spellcheck="false" aria-label="Answer ${i + 1}">
            <span class="fb small" data-fb="${i}"></span>
          </div>`).join('')}
        <div class="btn-row"><button class="btn primary" type="submit">Check answers</button></div>
      </form>`;
    $('input', box)?.focus();
    $('form', box).onsubmit = (e) => {
      e.preventDefault();
      let correct = 0;
      ex.items.forEach((it, i) => {
        const input = $(`input[data-i="${i}"]`, box);
        const g = input.value;
        const ok = it.accept ? it.accept(g) : norm(g) === norm(it.answer);
        if (ok) correct++;
        input.style.borderColor = ok ? 'var(--ok)' : 'var(--bad)';
        input.readOnly = true;
        const extra = it.explain ? it.explain(g) : '';
        $(`[data-fb="${i}"]`, box).innerHTML = ok
          ? `<span class="badge ok">✓</span>`
          : `<span class="badge bad">✗</span> <span class="muted">${it.accept ? 'e.g.' : ''} ${esc(it.answer)}${extra ? ` · ${extra}` : ''}</span>`;
      });
      const btnRow = $('.btn-row', box);
      btnRow.innerHTML = `<p class="mb0"><b>${correct} / ${ex.items.length}</b> ${correct === ex.items.length ? '🎉 Perfect!' : ''}</p>
        <button class="btn" type="button" id="again">Try another set</button>`;
      $('#again', box).onclick = () => runExercise(box, gen);
    };
  };

  if (!ex.study) return showRecall();
  box.innerHTML = `
    <h2>${esc(ex.title)}</h2>
    <p class="muted">${ex.intro}</p>
    <div class="card soft">${ex.study}</div>
    <div class="btn-row" style="margin-top:14px"><button class="btn primary" id="ready">I’ve memorized it, test me</button></div>`;
  $('#ready', box).onclick = showRecall;
}
