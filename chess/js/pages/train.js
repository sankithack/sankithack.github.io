import { h, icon, shuffle } from '../lib/dom.js';
import { Board } from '../lib/board.js';
import { LineViewer } from '../lib/viewer.js';
import { buildLine, lineText } from '../lib/line.js';
import { saveBest, best, rateCard, cardState } from '../lib/store.js';
import { page, pageHead, chips, staticBoard } from './common.js';

export function render(data, id) {
  if (id === 'squares') return squareTrainer();
  if (id === 'quiz') return quiz(data);
  if (id === 'cards') return flashcards(data);
  const tile = (href, title, text, meta) => h('a.train-tile', { href }, h('h2', title), h('p', text), h('span.train-meta', meta));
  return page('Train',
    pageHead('Train', 'Understanding comes first; these trainers make it stick. Your best scores are saved in this browser.'),
    h('div.train-grid',
      tile('#/train/squares', 'Square trainer', 'A square is named; click it on the board. Thirty seconds, as many as you can. Builds the board vision you need to read notation.', `Best: ${best('squares')}`),
      tile('#/train/quiz', 'Quiz', 'Name the opening or variation from its moves, spot the tactic in a position, and match endgame principles.', `Best: ${Math.max(best('quiz-openings'), best('quiz-variations'), best('quiz-tactics'), best('quiz-endgames'))}/10`),
      tile('#/train/cards', 'Flashcards', 'One-line memory hooks for every opening, variation, tactic, plan and endgame. Mark what you know and review the rest.', 'Spaced by you')));
}

// ---------------------------------------------------------------- square trainer
function squareTrainer() {
  const DURATION = 30000;
  const opts = { side: 'white', coords: false };
  const target = h('div.sq-target', { 'aria-live': 'assertive' }, '—');
  const scoreEl = h('span.sq-score', '0');
  const timeBar = h('div.sq-time', h('span'));
  const result = h('div.sq-result', { hidden: true });
  const boardBox = h('div.sq-board');
  let running = false, score = 0, misses = 0, streak = 0, want = null, endAt = 0, raf = 0;

  const board = new Board(boardBox, { coords: opts.coords, onSquare: (sq) => click(sq), label: 'Empty board for the square trainer' });
  board.setPosition('8/8/8/8/8/8/8/8 w - - 0 1', { animate: false });

  const pick = () => {
    let s;
    do s = 'abcdefgh'[Math.floor(Math.random() * 8)] + (1 + Math.floor(Math.random() * 8)); while (s === want);
    want = s;
    if (opts.side === 'random') board.setOrientation(Math.random() < 0.5 ? 'white' : 'black');
    target.textContent = s;
    target.classList.remove('pop'); void target.offsetWidth; target.classList.add('pop');
  };
  function click(sq) {
    if (!running) return;
    if (sq === want) { score++; streak++; board.flash(sq, 'good'); scoreEl.textContent = score; pick(); }
    else { misses++; streak = 0; board.flash(sq, 'bad'); board.flash(want, 'show'); }
    scoreEl.parentElement.classList.toggle('hot', streak >= 5);
  }
  const tick = () => {
    const left = Math.max(0, endAt - performance.now());
    timeBar.firstChild.style.transform = `scaleX(${left / DURATION})`;
    timeBar.classList.toggle('low', left < 5000);
    if (left <= 0) return finish();
    raf = requestAnimationFrame(tick);
  };
  function start() {
    cancelAnimationFrame(raf);
    running = true; score = 0; misses = 0; streak = 0; scoreEl.textContent = '0';
    result.hidden = true; startBtn.textContent = 'Restart';
    board.setOrientation(opts.side === 'black' ? 'black' : 'white');
    pick();
    endAt = performance.now() + DURATION;
    raf = requestAnimationFrame(tick);
  }
  function finish() {
    running = false; target.textContent = '—';
    const record = saveBest('squares', score);
    const acc = score + misses ? Math.round((score / (score + misses)) * 100) : 0;
    result.hidden = false;
    result.replaceChildren(h('p.sq-final', `${score} squares`), h('p', `${acc}% accuracy. ${record ? 'New personal best!' : `Best: ${best('squares')}.`}`),
      h('button.btn.btn-primary', { type: 'button', onclick: start }, 'Play again'));
    startBtn.textContent = 'Start';
  }
  const startBtn = h('button.btn.btn-primary', { type: 'button', onclick: start }, 'Start');
  const stop = () => { cancelAnimationFrame(raf); running = false; };
  window.addEventListener('hashchange', stop, { once: true });

  return page('Square trainer',
    h('nav.crumbs', h('a', { href: '#/train' }, 'Train'), h('span', 'Square trainer')),
    h('div.study.study-trainer',
      h('div.study-board', boardBox),
      h('div.study-text',
        h('h1', 'Square trainer'),
        h('p', 'Click the named square as fast as you can. Every square has a name: a file letter (a–h, left to right for White) and a rank number (1–8, from White\'s side).'),
        h('div.sq-hud', h('div.sq-target-wrap', h('span.muted', 'Find'), target), h('div.sq-score-wrap', h('span.muted', 'Score'), scoreEl)),
        timeBar,
        h('div.trainer-opts',
          h('div.filter-row', h('span.filter-label', 'View from'), chips('Board orientation', [['white', 'White'], ['black', 'Black'], ['random', 'Random']], opts.side, (v) => { opts.side = v; board.setOrientation(v === 'black' ? 'black' : 'white'); })),
          h('div.filter-row', h('span.filter-label', 'Coordinates'), chips('Coordinates', [['off', 'Hidden'], ['on', 'Shown']], 'off', (v) => { opts.coords = v === 'on'; board.setCoords(opts.coords); }))),
        h('div.puzzle-actions', startBtn, h('span.muted', `Best: ${best('squares')}`)),
        result,
        h('p.mnemonic', 'Memory hook: White\'s queen starts on d1, a light square — "queen on her colour". The long diagonals a1–h8 and h1–a8 cross at d4/e5 and d5/e4.'))));
}

// ---------------------------------------------------------------- quiz
function quiz(data) {
  const DECKS = {
    openings: { label: 'Name the opening', build: () => shuffle(data.openings).slice(0, 10).map((o) => ({
      prompt: 'Which opening is this?', moves: o.mainLine.slice(0, 8), orientation: o.side, answer: o.name,
      options: shuffle([o.name, ...shuffle(data.openings.filter((x) => x !== o)).slice(0, 3).map((x) => x.name)]), explain: o.mnemonic })) },
    variations: { label: 'Name the variation', build: () => {
      const all = data.openings.flatMap((o) => o.variations.map((v) => ({ ...v, opening: o })));
      return shuffle(all).slice(0, 10).map((v) => {
        const siblings = shuffle(v.opening.variations.filter((x) => x.name !== v.name)).slice(0, 3).map((x) => x.name);
        return { prompt: `${v.opening.name}: which variation is this?`, moves: v.moves, orientation: v.opening.side, answer: v.name,
          options: shuffle([v.name, ...siblings]), explain: v.idea };
      });
    } },
    tactics: { label: 'Spot the tactic', build: () => shuffle(data.tactics).slice(0, 10).map((t) => ({
      prompt: `${buildLine({ fen: t.fen, setup: t.setup })[0].fen.split(' ')[1] === 'w' ? 'White' : 'Black'} to move. Which motif wins here?`,
      fen: t.fen, setup: t.setup, answer: t.name, explain: `${t.solution[0]}! ${t.explanation}`,
      orientation: buildLine({ fen: t.fen, setup: t.setup })[0].fen.split(' ')[1] === 'w' ? 'white' : 'black',
      options: shuffle([t.name, ...shuffle(data.tactics.filter((x) => x !== t)).slice(0, 3).map((x) => x.name)]) })) },
    endgames: { label: 'Endgame principles', build: () => shuffle(data.endgames).slice(0, 10).map((e) => ({
      prompt: `"${e.mnemonic}" — which endgame idea is this?`, fen: e.lines[0].fen, answer: e.name, explain: e.summary,
      options: shuffle([e.name, ...shuffle(data.endgames.filter((x) => x !== e)).slice(0, 3).map((x) => x.name)]) })) },
  };
  let deck = 'openings', qs = [], i = 0, score = 0, answered = false;
  const boardBox = h('div.quiz-board');
  const viewer = new LineViewer(boardBox, { showSheet: false, showNotes: false, speed: 650, label: 'Quiz position' });
  const promptEl = h('h2.quiz-prompt');
  const opts = h('div.quiz-options');
  const feedback = h('div.quiz-feedback', { 'aria-live': 'polite' });
  const meter = h('div.quiz-meter');
  const nextBtn = h('button.btn.btn-primary', { type: 'button', hidden: true, onclick: () => ask(i + 1) }, 'Next question');

  function begin() { qs = DECKS[deck].build(); score = 0; ask(0); }
  function ask(n) {
    i = n; answered = false;
    nextBtn.hidden = true; feedback.replaceChildren();
    if (i >= qs.length) return end();
    const q = qs[i];
    meter.replaceChildren(...qs.map((_, k) => h('span' + (k < i ? '.done' : k === i ? '.now' : ''))));
    promptEl.textContent = `${i + 1}. ${q.prompt}`;
    viewer.o.autoplay = !!q.moves;
    viewer.load({ fen: q.fen, setup: q.setup, moves: q.moves || [], orientation: q.orientation || 'white' });
    opts.replaceChildren(...q.options.map((o) => h('button.quiz-option', { type: 'button', onclick: (e) => answer(o, e.currentTarget) }, o)));
  }
  function answer(choice, btn) {
    if (answered) return;
    answered = true;
    const q = qs[i];
    const right = choice === q.answer;
    if (right) score++;
    [...opts.children].forEach((b) => { b.disabled = true; if (b.textContent === q.answer) b.classList.add('right'); });
    if (!right) btn.classList.add('wrong');
    meter.children[i].classList.add(right ? 'right' : 'wrong');
    feedback.replaceChildren(h('p.quiz-verdict.' + (right ? 'good' : 'bad'), icon(right ? 'check' : 'x', 18), right ? 'Correct.' : `It's the ${q.answer}.`),
      q.moves ? h('p.line-moves', lineText(q.moves)) : null, h('p', q.explain));
    nextBtn.hidden = false;
    nextBtn.textContent = i === qs.length - 1 ? 'See result' : 'Next question';
    nextBtn.focus();
  }
  function end() {
    const record = saveBest('quiz-' + deck, score);
    promptEl.textContent = `You scored ${score} of ${qs.length}.`;
    opts.replaceChildren();
    feedback.replaceChildren(h('p', record ? 'New personal best for this quiz!' : `Your best is ${best('quiz-' + deck)} of 10.`),
      h('button.btn.btn-primary', { type: 'button', onclick: begin }, 'Play again'));
  }

  begin();
  return page('Quiz',
    h('nav.crumbs', h('a', { href: '#/train' }, 'Train'), h('span', 'Quiz')),
    h('header.page-head', h('h1', 'Quiz'), h('p.lede', 'Ten questions per round. Read the explanation after each answer — that is where the learning happens.')),
    h('div.quiz-deck', chips('Quiz type', Object.entries(DECKS).map(([k, d]) => [k, d.label]), deck, (v) => { deck = v; begin(); })),
    h('div.study.study-quiz',
      h('div.study-board', boardBox),
      h('div.study-text', meter, promptEl, opts, feedback, nextBtn)));
}

// ---------------------------------------------------------------- flashcards
function flashcards(data) {
  const DECKS = {
    openings: { label: 'Openings', cards: data.openings.map((o) => ({ id: 'o:' + o.id, front: o.name, sub: lineText(o.mainLine.slice(0, 6)), back: o.mnemonic, more: o.purpose, board: { moves: o.mainLine }, orientation: o.side })) },
    variations: { label: 'Variations', cards: data.openings.flatMap((o) => o.variations.map((v) => ({ id: `v:${o.id}:${v.name}`, front: v.name, sub: o.name, back: lineText(v.moves), more: v.idea, board: { moves: v.moves }, orientation: o.side }))) },
    tactics: { label: 'Tactics', cards: data.tactics.map((t) => ({ id: 't:' + t.id, front: t.name, back: t.mnemonic, more: t.definition })) },
    strategy: { label: 'Strategy', cards: data.strategy.map((s) => ({ id: 's:' + s.id, front: s.name, back: s.mnemonic, more: s.summary })) },
    endgames: { label: 'Endgames', cards: data.endgames.map((e) => ({ id: 'e:' + e.id, front: e.name, back: e.mnemonic, more: e.summary, board: { fen: e.lines[0].fen } })) },
  };
  let deck = 'openings', order = [], i = 0;
  const stage = h('div.card-stage');
  const counter = h('p.card-count');
  const known = () => DECKS[deck].cards.filter((c) => cardState(c.id) === 'known').length;

  function begin() {
    // unknown and "again" cards first, then the ones you already know
    const cards = DECKS[deck].cards;
    order = [...shuffle(cards.filter((c) => cardState(c.id) !== 'known')), ...shuffle(cards.filter((c) => cardState(c.id) === 'known'))];
    i = 0; show();
  }
  function show() {
    stage.replaceChildren();
    counter.textContent = `${known()} of ${DECKS[deck].cards.length} known`;
    if (i >= order.length) {
      stage.append(h('div.flashcard.done', h('div.flash-face', h('h2', 'Deck finished'), h('p', `${known()} of ${order.length} marked as known.`), h('button.btn.btn-primary', { type: 'button', onclick: begin }, 'Go again'))));
      return;
    }
    const c = order[i];
    const boardEl = c.board ? h('div.flash-board') : null;
    const card = h('div.flashcard', { tabindex: 0, role: 'button', 'aria-label': `Flashcard: ${c.front}. Press space to flip.` },
      h('div.flash-inner',
        h('div.flash-face.flash-front', h('span.flash-deck', DECKS[deck].label), h('h2', c.front), c.sub ? h('p.muted', c.sub) : null, boardEl, h('p.flash-tip', 'Tap or press space to flip')),
        h('div.flash-face.flash-back', h('h2', c.front), h('p.flash-hook', c.back), h('p', c.more))));
    if (boardEl) staticBoard(boardEl, c.board, { orientation: c.orientation || 'white', lastMove: true });
    const flip = () => card.classList.toggle('flipped');
    card.addEventListener('click', flip);
    card.addEventListener('keydown', (e) => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); flip(); } });
    const rate = (k) => { rateCard(c.id, k); card.classList.add(k ? 'out-right' : 'out-left'); setTimeout(() => { i++; show(); }, 260); };
    stage.append(card, h('div.card-actions',
      h('button.btn', { type: 'button', onclick: () => rate(false) }, icon('reset', 16), 'Review again'),
      h('button.btn.btn-primary', { type: 'button', onclick: () => rate(true) }, icon('check', 16), 'I know this')));
    card.focus({ preventScroll: true });
  }

  begin();
  return page('Flashcards',
    h('nav.crumbs', h('a', { href: '#/train' }, 'Train'), h('span', 'Flashcards')),
    h('header.page-head', h('h1', 'Flashcards'), h('p.lede', 'Say the idea out loud before you flip. Cards you mark "Review again" come back first next time.')),
    h('div.quiz-deck', chips('Deck', Object.entries(DECKS).map(([k, d]) => [k, `${d.label} (${d.cards.length})`]), deck, (v) => { deck = v; begin(); })),
    counter, stage);
}
