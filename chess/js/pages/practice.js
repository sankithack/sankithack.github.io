// Practice hub and every practice mode.
import { h, icon, shuffle, cap } from '../lib/dom.js';
import { Board } from '../lib/board.js';
import { LineDrill } from '../lib/drill.js';
import { Sparring } from '../lib/sparring.js';
import { createPuzzle, startFenOf, allPuzzles } from '../lib/puzzle.js';
import { Chess, buildLine, lineText, normMove, parseArrow } from '../lib/line.js';
import { findMove, bare } from '../lib/moves.js';
import { recordDrill, drillState, isMastered, markSolved, saveBest, best } from '../lib/store.js';
import { page, pageHead, chips, levelTag, tag, staticBoard } from './common.js';

const crumbs = (label) => h('nav.crumbs', { 'aria-label': 'Breadcrumb' }, h('a', { href: '#/practice' }, 'Practice'), h('span', label));

export function render(data, id, ...rest) {
  const modes = { opening: openingDrill, openings: openingChooser, rush, candidates, calculate, strategy: strategyPractice, endgame: endgamePractice, attack: attackPractice, memory, visualize, colors };
  if (modes[id]) return modes[id](data, ...rest);
  return hub(data);
}

// ------------------------------------------------------------------ hub
function hub(data) {
  const lines = allOpeningLines(data);
  const mastered = lines.filter((l) => isMastered(l.key)).length;
  const tile = (href, title, text, meta, ic) => h('a.practice-tile', { href }, h('span.practice-icon', icon(ic, 22)), h('h3', title), h('p', text), meta ? h('span.train-meta', meta) : null);
  const section = (title, lede, ...tiles) => h('section.practice-section', h('h2', title), h('p.muted', lede), h('div.practice-grid', tiles));
  return page('Practice',
    pageHead('Practice', 'Reading builds understanding; practice builds skill. Every lesson on this site has a practice mode — pick one and play.'),
    section('Openings', 'Play your side of any line from memory. The app answers with the book moves and explains each one.',
      tile('#/practice/openings', 'Opening drills', `${lines.length} lines across ${data.openings.length} openings: main lines, variations, traps and how-to-beat-it lines.`, `${mastered} mastered`, 'book')),
    section('Tactics & thinking', 'Spot patterns fast, scan for candidate moves, and calculate several moves ahead.',
      tile('#/practice/rush', 'Puzzle rush', 'Three minutes, as many puzzles as you can. One mistake ends the puzzle.', `Best ${best('rush')}`, 'bolt'),
      tile('#/practice/candidates', 'Candidate moves', 'Find every check and capture in the position before you choose — the habit that stops blunders.', `Best ${best('candidates')}%`, 'search'),
      tile('#/practice/calculate', 'Calculate 3+ moves', 'Work out the whole combination in your head and enter it before the board moves.', `${best('calculate')} solved`, 'target'),
      tile('#/practice/attack', 'Attack drills', 'Play the attacker in classic king hunts: Greek gift, pawn storms, sacrifices on f7.', null, 'flag')),
    section('Strategy & endgames', 'Find the key square, then win (or hold) endgames against the computer.',
      tile('#/practice/strategy', 'Find the square', `${data.strategy.length} positions: click the weak square, the outpost, the bad bishop…`, `Best ${best('strategy')}/${Math.min(10, data.strategy.length)}`, 'compass'),
      tile('#/practice/endgame/kq-vs-k', 'Endgames vs computer', 'Mate with K+Q, K+R and two bishops; win or draw king-and-pawn endings against perfect defence.', null, 'flag')),
    section('Your games', 'The fastest way to improve: look at your own games and find the moments that decided them.',
      tile('#/games', 'Classic games', 'Five famous games with notes. Play the winner\'s side and guess every move.', null, 'book'),
      tile('#/review', 'Review a game', 'Paste a PGN from Lichess or Chess.com. Step through it, see every check and capture, and jump to loose pieces and missed mates.', null, 'search')),
    section('Memory & vision', 'Train the mental board: square names and colours, remembering positions, following moves without a board.',
      tile('#/train/squares', 'Square trainer', 'Click the named square against the clock.', `Best ${best('squares')}`, 'target'),
      tile('#/practice/colors', 'Square colours', 'Light or dark? Answer without looking — the first blindfold skill.', `Best ${best('colors')}`, 'eye'),
      tile('#/practice/memory', 'Position memory', 'Study a position for ten seconds, then find where the pieces were.', `Best ${best('memory')}/9`, 'eye'),
      tile('#/practice/visualize', 'Follow the moves', 'Moves are read out without the board moving; then say where the pieces went.', `Best ${best('visualize')}/5`, 'eye'),
      tile('#/train/quiz', 'Quiz', 'Name openings and variations, spot tactics.', null, 'book'),
      tile('#/train/cards', 'Flashcards', 'Memory hooks for every concept.', null, 'book')));
}

// ------------------------------------------------------------------ openings
export function allOpeningLines(data) {
  const out = [];
  for (const o of data.openings) {
    const opp = o.side === 'white' ? 'b' : 'w', mine = o.side === 'white' ? 'w' : 'b';
    out.push({ key: `o:${o.id}:main:0`, opening: o, kind: 'main', idx: 0, title: 'Main line', moves: o.mainLine, side: mine, level: o.difficulty });
    o.variations.forEach((v, i) => out.push({ key: `o:${o.id}:variation:${i}`, opening: o, kind: 'variation', idx: i, title: v.name, moves: v.moves, side: mine, level: v.level, intro: v.idea }));
    o.traps.forEach((t, i) => out.push({ key: `o:${o.id}:trap:${i}`, opening: o, kind: 'trap', idx: i, title: t.name, moves: t.moves, side: t.side === 'white' ? 'w' : 'b', level: 'intermediate', intro: t.explanation }));
    o.counters.forEach((c, i) => out.push({ key: `o:${o.id}:counter:${i}`, opening: o, kind: 'counter', idx: i, title: c.name, moves: c.moves, side: opp, level: 'intermediate', intro: c.why }));
  }
  return out;
}
const KIND_LABEL = { main: 'Main line', variation: 'Variation', trap: 'Trap', counter: 'How to beat it' };

function openingChooser(data) {
  const lines = allOpeningLines(data);
  let filter = 'all';
  const list = h('div.drill-list');
  const paint = () => list.replaceChildren(...data.openings.map((o) => {
    const ls = lines.filter((l) => l.opening === o && (filter === 'all' || l.kind === filter));
    if (!ls.length) return null;
    const done = ls.filter((l) => isMastered(l.key)).length;
    return h('details.drill-group', { open: filter !== 'all' },
      h('summary', h('strong', o.name), h('span.muted', ` ${done}/${ls.length} mastered`), h('span.mini-meter', h('span', { style: { width: `${(done / ls.length) * 100}%` } }))),
      h('ul.drill-lines', ls.map((l) => h('li', h('a', { href: `#/practice/opening/${o.id}/${l.kind}/${l.idx}` },
        isMastered(l.key) ? icon('check', 16) : h('span.dot'), h('span', l.title), h('span.muted.small', ` ${KIND_LABEL[l.kind]}`), levelTag(l.level))))));
  }).filter(Boolean));
  paint();
  const random = () => { const pool = lines.filter((l) => !isMastered(l.key) && (filter === 'all' || l.kind === filter)); const l = shuffle(pool.length ? pool : lines)[0]; location.hash = `#/practice/opening/${l.opening.id}/${l.kind}/${l.idx}`; };
  return page('Opening drills', crumbs('Opening drills'),
    pageHead('Opening drills', 'Pick a line and play your side from memory. A run without mistakes or hints marks the line as mastered.'),
    h('div.panel-tools', chips('Line type', [['all', 'All'], ['main', 'Main lines'], ['variation', 'Variations'], ['trap', 'Traps'], ['counter', 'How to beat it']], filter, (v) => { filter = v; paint(); }),
      h('button.btn.btn-primary', { type: 'button', onclick: random }, icon('play', 16), 'Random unmastered line')),
    list);
}

function openingDrill(data, oid, kind = 'main', idx = '0') {
  const l = allOpeningLines(data).find((x) => x.opening.id === oid && x.kind === kind && String(x.idx) === String(idx));
  if (!l) return page('Not found', crumbs('Not found'), h('p', 'That line does not exist.'));
  const st = drillState(l.key);
  const result = h('div.drill-result');
  const mount = h('div.study-board');
  new LineDrill(mount, { moves: l.moves, side: l.side, intro: l.intro, onDone: (r) => {
    recordDrill(l.key, r.perfect);
    const s = drillState(l.key);
    result.replaceChildren(h('p', r.perfect ? 'Mastered. ' : '', `Runs: ${s.runs}, perfect runs: ${s.perfect}.`),
      h('button.btn.btn-primary', { type: 'button', onclick: nextLine }, 'Next line'));
  } });
  const lines = allOpeningLines(data);
  const nextLine = () => { const pool = lines.filter((x) => x.opening === l.opening && x.key !== l.key && !isMastered(x.key)); const n = pool[0] || lines.filter((x) => !isMastered(x.key) && x.key !== l.key)[0] || lines[0]; location.hash = `#/practice/opening/${n.opening.id}/${n.kind}/${n.idx}`; };
  return page(`Drill: ${l.title}`, crumbs(l.opening.name),
    h('div.study',
      mount,
      h('div.study-text',
        h('header.study-head', h('h1', l.title), h('p.study-sub', `${l.opening.name}. ${KIND_LABEL[l.kind]}. You play ${l.side === 'w' ? 'White' : 'Black'}.`), h('div.tags', levelTag(l.level), st ? tag(`${st.perfect}/${st.runs} perfect`, 'quiet') : null)),
        h('details.spoiler', h('summary', 'Peek at the full line'), h('p.line-moves', lineText(l.moves))),
        result,
        h('p', h('a', { href: `#/openings/${l.opening.id}` }, `Study the ${l.opening.name} first`), ' · ', h('a', { href: '#/practice/openings' }, 'All drills')))));
}

// ------------------------------------------------------------------ puzzle rush
function rush(data) {
  let level = 'all', score = 0, endAt = 0, raf = 0, running = false, queue = [];
  const stage = h('div.study-board');
  const timeBar = h('div.sq-time', h('span'));
  const scoreEl = h('span.sq-score', '0');
  const info = h('div.rush-info');
  const startBtn = h('button.btn.btn-primary', { type: 'button', onclick: () => begin() }, 'Start the rush');
  const pool = () => allPuzzles(data.tactics).filter((t) => level === 'all' || t.level === level);
  function next() {
    if (!running) return;
    if (!queue.length) queue = shuffle(pool());
    const t = queue.pop();
    const p = createPuzzle(t, { compact: true, failOnMistake: true,
      onSolved: ({ clean }) => { if (clean) { score++; scoreEl.textContent = score; markSolved(t.pid); } setTimeout(next, 700); },
      onFailed: () => next() });
    stage.replaceChildren(h('p.rush-name', t.name, ' ', levelTag(t.level)), p.el);
  }
  function begin() {
    running = true; score = 0; scoreEl.textContent = '0'; queue = shuffle(pool());
    info.replaceChildren(); startBtn.textContent = 'Restart';
    endAt = performance.now() + 180000;
    cancelAnimationFrame(raf);
    const tick = () => {
      const left = Math.max(0, endAt - performance.now());
      timeBar.firstChild.style.transform = `scaleX(${left / 180000})`;
      timeBar.classList.toggle('low', left < 20000);
      if (!stage.isConnected) { running = false; return; }
      if (left <= 0) return end();
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    next();
  }
  function end() {
    running = false;
    const record = saveBest('rush', score);
    stage.replaceChildren(h('div.sq-result', h('p.sq-final', `${score} puzzles`), h('p', record ? 'New personal best!' : `Best: ${best('rush')}.`), h('button.btn.btn-primary', { type: 'button', onclick: begin }, 'Go again')));
  }
  stage.append(h('div.rush-intro', h('p', 'Solve as many puzzles as you can in 3 minutes. A wrong move skips the puzzle.')));
  return page('Puzzle rush', crumbs('Puzzle rush'),
    h('div.study',
      stage,
      h('div.study-text', h('h1', 'Puzzle rush'),
        h('div.sq-hud', h('div.sq-score-wrap', h('span.muted', 'Solved'), scoreEl)), timeBar,
        h('div.filter-row', h('span.filter-label', 'Level'), chips('Level', [['all', 'All'], ['beginner', 'Beginner'], ['intermediate', 'Intermediate'], ['advanced', 'Advanced']], level, (v) => { level = v; })),
        h('div.puzzle-actions', startBtn), info,
        h('p.mnemonic', 'Speed comes from patterns. If a puzzle feels new, solve it slowly on the Tactics page first.'))));
}

// ------------------------------------------------------------------ candidate moves (CCT scan)
function candidates(data) {
  let t, chess, found, round = 0, totalFound = 0, totalWanted = 0;
  const boardBox = h('div.study-board');
  const listEl = h('div.cand-list');
  const status = h('div.puzzle-status');
  const board = new Board(boardBox, {
    label: 'Candidate moves board',
    movable: (sq) => chess && chess.get(sq)?.color === chess.turn(),
    targets: (sq) => chess.moves({ square: sq, verbose: true }).map((m) => m.to),
    onMove: (from, to) => { add(chess.moves({ verbose: true }).find((m) => m.from === from && m.to === to && (!m.promotion || m.promotion === 'q'))); return false; },
  });
  const isCandidate = (m) => /[+#]/.test(m.san) || !!m.captured;
  function load() {
    t = shuffle(allPuzzles(data.tactics))[0];
    chess = new Chess(startFenOf(t));
    found = new Map();
    board.setOrientation(chess.turn() === 'w' ? 'white' : 'black');
    board.setPosition(chess.fen(), { animate: false });
    board.setArrows([]); board.setKeySquares([]);
    paintList();
    status.className = 'puzzle-status';
    status.replaceChildren(icon('search', 18), h('span', `${chess.turn() === 'w' ? 'White' : 'Black'} to move. Enter every check and capture — drag or tap pieces. The board won't move.`));
  }
  function add(m) {
    if (!m || found.has(m.san)) return;
    found.set(m.san, m);
    board.flash(m.to, isCandidate(m) ? 'good' : 'bad');
    paintList();
  }
  function paintList() {
    listEl.replaceChildren(...[...found.values()].map((m) => h('span.cand-chip' + (isCandidate(m) ? '.ok' : '.no'), m.san)));
    board.setArrows([...found.values()].map((m) => ({ from: m.from, to: m.to, kind: isCandidate(m) ? 'plan' : 'alt' })));
  }
  function check() {
    const all = chess.moves({ verbose: true }).filter(isCandidate);
    const got = all.filter((m) => found.has(m.san));
    const missed = all.filter((m) => !found.has(m.san));
    round++; totalFound += got.length; totalWanted += all.length;
    board.setArrows([...got.map((m) => ({ from: m.from, to: m.to, kind: 'plan' })), ...missed.map((m) => ({ from: m.from, to: m.to, kind: 'threat' }))]);
    const pct = totalWanted ? Math.round((totalFound / totalWanted) * 100) : 100;
    status.className = 'puzzle-status ' + (missed.length ? 'status-hint' : 'status-good');
    status.replaceChildren(icon(missed.length ? 'bulb' : 'check', 18), h('span', missed.length
      ? `You found ${got.length} of ${all.length}. Missed (red): ${missed.map((m) => m.san).join(', ')}.`
      : `All ${all.length} found!`));
    listEl.append(h('p.small', `Best move here: ${t.solution[0]} (${t.name}). Accuracy over ${round} round${round > 1 ? 's' : ''}: ${pct}%.`));
    if (round >= 5) saveBest('candidates', pct);
  }
  load();
  return page('Candidate moves', crumbs('Candidate moves'),
    h('div.study', boardBox,
      h('div.study-text', h('h1', 'Candidate moves'),
        h('p', 'Strong players look at forcing moves first: every ', h('strong', 'check'), ', every ', h('strong', 'capture'), ', then every ', h('strong', 'threat'), '. Scan the whole board — for both sides — before you pick a move.'),
        status, listEl,
        h('div.puzzle-actions',
          h('button.btn.btn-primary', { type: 'button', onclick: check }, icon('check', 16), 'Check my list'),
          h('button.btn', { type: 'button', onclick: () => { found.clear(); paintList(); } }, icon('reset', 16), 'Clear'),
          h('button.btn', { type: 'button', onclick: load }, 'Next position')),
        h('p.muted.small', 'Accuracy is saved after five rounds. Green arrows: checks/captures you found. Red: ones you missed.'))));
}

// ------------------------------------------------------------------ calculation
function calculate(data) {
  const pool = allPuzzles(data.tactics).filter((t) => t.solution.length >= 3);
  let t, chess, entered;
  const boardBox = h('div.study-board');
  const board = new Board(boardBox, { label: 'Calculation board' });
  const status = h('div.puzzle-status');
  const lineEl = h('ol.calc-line');
  const input = h('input.move-input', { type: 'text', placeholder: 'Next move in the line, e.g. Nf7+', 'aria-label': 'Next move of your calculated line', autocomplete: 'off', autocapitalize: 'off', spellcheck: false });
  function load() {
    t = shuffle(pool)[0];
    const start = startFenOf(t);
    chess = new Chess(start); entered = [];
    board.setOrientation(chess.turn() === 'w' ? 'white' : 'black');
    board.setPosition(start, { animate: false }); board.setArrows([]); board.setKeySquares([]);
    paint();
    status.className = 'puzzle-status';
    status.replaceChildren(icon('target', 18), h('span', `${chess.turn() === 'w' ? 'White' : 'Black'} to move. Goal: ${t.goal.toLowerCase()}. Enter the whole line — ${Math.ceil(t.solution.length / 2)} of your moves and the replies — without moving the pieces.`));
    input.focus({ preventScroll: true });
  }
  function paint() {
    lineEl.replaceChildren(...entered.map((m, i) => h('li' + (i % 2 ? '.reply' : ''), m.san)));
    const colors = ['plan', 'threat'];
    board.setArrows(entered.map((m, i) => ({ from: m.from, to: m.to, kind: colors[i % 2] })));
  }
  function addMove(txt) {
    const m = findMove(chess, txt);
    if (!m) { status.className = 'puzzle-status status-bad'; status.replaceChildren(icon('x', 18), h('span', `"${txt}" isn't legal in the position after the moves you entered.`)); return; }
    chess.move(m.san); entered.push(m); paint();
    status.className = 'puzzle-status'; status.replaceChildren(icon('target', 18), h('span', `${entered.length} move${entered.length > 1 ? 's' : ''} entered. ${entered.length >= t.solution.length ? 'Submit when ready.' : 'Keep going — include the opponent\'s best replies.'}`));
  }
  async function submit() {
    const mine = entered.filter((_, i) => i % 2 === 0).map((m) => bare(m.san));
    const want = t.solution.filter((_, i) => i % 2 === 0).map(bare);
    const ok = mine.length >= want.length && want.every((s, i) => s === mine[i]) || (entered.length && (() => { const c = new Chess(startFenOf(t)); entered.forEach((m) => c.move(m.san)); return c.isCheckmate(); })());
    status.className = 'puzzle-status ' + (ok ? 'status-good' : 'status-bad');
    status.replaceChildren(icon(ok ? 'check' : 'x', 18), h('span', ok ? 'Calculated correctly! Watch it play out.' : `Not quite. The line is ${lineText(t.solution, { fen: t.fen, setup: t.setup })}. Watch it.`));
    if (ok) saveBest('calculate', best('calculate') + 1);
    // animate the real solution
    const c = new Chess(startFenOf(t));
    board.setArrows([]);
    for (const san of t.solution) {
      await new Promise((r) => setTimeout(r, 800));
      if (!boardBox.isConnected) return;
      const mv = c.move(san);
      board.setPosition(c.fen(), { lastMove: { from: mv.from, to: mv.to } });
    }
    board.setArrows((t.arrows || []).map(parseArrow));
  }
  load();
  return page('Calculate', crumbs('Calculation'),
    h('div.study', boardBox,
      h('div.study-text', h('h1', 'Calculate 3+ moves ahead'),
        h('p', 'The board stays still. Enter your move, the reply you expect, your next move, and so on. Arrows show your line: green for your moves, red for the opponent\'s.'),
        status, lineEl,
        h('form.move-form', { onsubmit: (e) => { e.preventDefault(); if (input.value.trim()) { addMove(input.value); input.value = ''; } } }, input, h('button.btn', { type: 'submit' }, 'Add')),
        h('div.puzzle-actions',
          h('button.btn.btn-primary', { type: 'button', onclick: submit }, icon('play', 16), 'Submit line'),
          h('button.btn', { type: 'button', onclick: () => { if (entered.length) { chess.undo(); entered.pop(); paint(); } } }, 'Undo'),
          h('button.btn', { type: 'button', onclick: load }, 'New position')),
        h('details.spoiler', h('summary', 'How to calculate'), h('ol.steps',
          h('li', 'Start with forcing moves: checks, captures, threats.'),
          h('li', 'For each, find the opponent\'s best reply — not the one you hope for.'),
          h('li', 'Picture the new position: which pieces moved? What is attacked now?'),
          h('li', 'Stop when the position is quiet, then evaluate: material, king safety, threats.'))))));
}

// ------------------------------------------------------------------ strategy: find the square
function strategyPractice(data) {
  const qs = shuffle(data.strategy).slice(0, 10);
  let i = 0, score = 0, locked = false;
  const boardBox = h('div.study-board');
  let board;
  const prompt = h('h2.quiz-prompt');
  const feedback = h('div.quiz-feedback');
  const meter = h('div.quiz-meter');
  const nextBtn = h('button.btn.btn-primary', { type: 'button', hidden: true, onclick: () => show(i + 1) }, 'Next');
  function show(n) {
    i = n; locked = false; nextBtn.hidden = true; feedback.replaceChildren();
    if (i >= qs.length) {
      const record = saveBest('strategy', score);
      prompt.textContent = `You scored ${score} of ${qs.length}.`;
      feedback.replaceChildren(h('p', record ? 'New personal best!' : `Best: ${best('strategy')}.`), h('button.btn.btn-primary', { type: 'button', onclick: () => { score = 0; shuffle(qs); show(0); } }, 'Again'));
      return;
    }
    const s = qs[i];
    meter.replaceChildren(...qs.map((_, k) => h('span' + (k < i ? '.done' : k === i ? '.now' : ''))));
    boardBox.replaceChildren();
    const frames = buildLine({ fen: s.fen, setup: s.setup });
    board = new Board(boardBox, { label: s.name, onSquare: (sq) => answer(sq) });
    board.setPosition(frames[frames.length - 1].fen, { animate: false });
    prompt.textContent = `${i + 1}. ${s.practice.prompt}`;
  }
  function answer(sq) {
    if (locked) return;
    locked = true;
    const s = qs[i];
    const right = s.practice.answers.includes(sq);
    if (right) score++;
    board.flash(sq, right ? 'good' : 'bad');
    board.setKeySquares(s.practice.answers);
    board.setArrows((s.arrows || []).map(parseArrow));
    meter.children[i].classList.add(right ? 'right' : 'wrong');
    feedback.replaceChildren(h('p.quiz-verdict.' + (right ? 'good' : 'bad'), icon(right ? 'check' : 'x', 18), right ? 'Correct.' : `The answer is ${s.practice.answers.join(' / ')}.`),
      h('p', s.practice.explain), h('p.muted', h('a', { href: `#/strategy/${s.id}` }, `Read: ${s.name}`)));
    nextBtn.hidden = false;
  }
  show(0);
  return page('Find the square', crumbs('Find the square'),
    h('div.study', boardBox, h('div.study-text', h('h1', 'Find the square'), meter, prompt, feedback, nextBtn)));
}

// ------------------------------------------------------------------ endgames vs computer
function endgamePractice(data, id) {
  const e = data.endgames.find((x) => x.id === id) || data.endgames[0];
  const pr = e.practice;
  const mount = h('div.study-board');
  const result = h('div.drill-result');
  const key = `e:${e.id}`;
  const done = ({ success, clean, perfect }) => {
    const ok = perfect ?? (success && clean);
    recordDrill(key, !!ok);
    result.replaceChildren(h('p', success || perfect !== undefined ? (ok ? 'Mastered!' : 'Completed — now try it with no take-backs.') : 'Try again — read the lesson if you are stuck.'));
  };
  let desc;
  if (pr.mode === 'drill') {
    const l = e.lines[pr.line];
    const side = pr.side || l.fen.split(' ')[1];
    new LineDrill(mount, { fen: l.fen, moves: l.moves, side, intro: e.summary, onDone: (r) => done({ perfect: r.perfect }) });
    desc = `Play ${side === 'w' ? 'White' : 'Black'}'s moves of the model line.`;
  } else if (pr.mode === 'mate') {
    new Sparring(mount, { fen: pr.fen, mode: 'mate', userSide: pr.side, goal: 'win', onDone: done });
    desc = pr.intro;
  } else {
    const l = e.lines[pr.line];
    const stm = l.fen.split(' ')[1];
    const pawns = (c) => (l.fen.split(' ')[0].match(c === 'w' ? /P/g : /p/g) || []).length;
    const userSide = l.expect === 'win' ? stm : l.expect === 'loss' ? (stm === 'w' ? 'b' : 'w') : (pawns('w') < pawns('b') ? 'w' : 'b');
    const goal = l.expect === 'draw' ? 'draw' : 'win';
    new Sparring(mount, { fen: l.fen, mode: 'solver', userSide, goal, onDone: done });
    desc = `The computer knows this ending perfectly. Any move that keeps the ${goal} is accepted; a move that spoils it is taken back.`;
  }
  return page(`Practice: ${e.name}`, crumbs('Endgames'),
    h('div.study', mount,
      h('div.study-text',
        h('h1', e.name), h('p.mnemonic', e.mnemonic), h('p', desc), result,
        h('h3', 'Remember'), h('ol.steps', e.points.map((p) => h('li', p))),
        h('p', h('a', { href: `#/endgames/${e.id}` }, 'Read the lesson')),
        h('h3', 'More endgames'),
        h('div.chips', data.endgames.map((x) => h('a.chip' + (x.id === e.id ? '.on' : ''), { href: `#/practice/endgame/${x.id}` }, isMastered(`e:${x.id}`) ? '✓ ' : '', x.name))))));
}

// ------------------------------------------------------------------ attack drills
function attackPractice(data, id) {
  const a = data.attack.find((x) => x.id === id) || data.attack[0];
  const mount = h('div.study-board');
  const result = h('div.drill-result');
  new LineDrill(mount, { fen: a.fen, moves: a.moves, side: a.side, intro: a.principle, onDone: (r) => { recordDrill(`a:${a.id}`, r.perfect); result.replaceChildren(h('p', r.perfect ? 'Attack mastered!' : 'Done — go again for a clean run.')); } });
  return page(`Attack: ${a.name}`, crumbs('Attack drills'),
    h('div.study', mount,
      h('div.study-text', h('h1', a.name), levelTag(a.level), h('p.mnemonic', a.mnemonic), h('p', a.principle), result,
        h('p', h('a', { href: `#/guide/attack/${a.id}` }, 'Watch the animated lesson first')),
        h('div.chips', data.attack.map((x) => h('a.chip' + (x.id === a.id ? '.on' : ''), { href: `#/practice/attack/${x.id}` }, isMastered(`a:${x.id}`) ? '✓ ' : '', x.name))))));
}

// ------------------------------------------------------------------ memory: position recall
function memory(data) {
  const positions = [
    ...data.openings.map((o) => ({ moves: o.mainLine.slice(0, 12), name: o.name })),
    ...data.tactics.map((t) => ({ fen: t.fen, setup: t.setup, name: t.name })),
  ];
  let round = 0, score = 0, fen, targets = [], qi = 0, timer;
  const boardBox = h('div.study-board');
  const board = new Board(boardBox, { label: 'Memory board', onSquare: (sq) => answer(sq) });
  const prompt = h('h2.quiz-prompt');
  const feedback = h('div.quiz-feedback');
  const countdown = h('div.sq-time', h('span'));
  const startBtn = h('button.btn.btn-primary', { type: 'button', onclick: () => { score = 0; round = 0; nextRound(); } }, 'Start');
  const NAMES = { K: 'king', Q: 'queen', R: 'rook', B: 'bishop', N: 'knight', P: 'pawn' };
  function nextRound() {
    clearTimeout(timer);
    if (round >= 3) {
      const record = saveBest('memory', score);
      prompt.textContent = `You scored ${score} of 9.`;
      feedback.replaceChildren(h('p', record ? 'New personal best!' : `Best: ${best('memory')}/9.`));
      startBtn.textContent = 'Play again';
      return;
    }
    round++;
    const p = shuffle(positions)[0];
    const frames = buildLine({ fen: p.fen, setup: p.setup, moves: p.moves || [] });
    fen = frames[frames.length - 1].fen;
    const c = new Chess(fen);
    const pieces = c.board().flat().filter(Boolean);
    const unique = pieces.filter((pc) => pc.type !== 'p' && pieces.filter((x) => x.type === pc.type && x.color === pc.color).length === 1);
    targets = shuffle(unique).slice(0, 3);
    qi = 0;
    board.setPosition(fen, { animate: true });
    prompt.textContent = `Round ${round}: memorise this position (${p.name}).`;
    feedback.replaceChildren(h('p.muted', 'Tip: group pieces into chunks — "castled king with pawns f7 g7 h7", "bishop pair aiming at the king".'));
    countdown.firstChild.style.transition = 'none'; countdown.firstChild.style.transform = 'scaleX(1)';
    requestAnimationFrame(() => { countdown.firstChild.style.transition = 'transform 10s linear'; countdown.firstChild.style.transform = 'scaleX(0)'; });
    timer = setTimeout(ask, 10000);
  }
  function ask() {
    if (!boardBox.isConnected) return;
    board.setPosition('8/8/8/8/8/8/8/8 w - - 0 1');
    const t = targets[qi];
    if (!t) return nextRound();
    prompt.textContent = `Where was the ${t.color === 'w' ? 'white' : 'black'} ${NAMES[t.type.toUpperCase()]}?`;
  }
  function answer(sq) {
    const t = targets[qi];
    if (!t || !prompt.textContent.startsWith('Where')) return;
    const right = t.square === sq;
    if (right) score++;
    board.flash(sq, right ? 'good' : 'bad');
    if (!right) board.flash(t.square, 'show');
    feedback.replaceChildren(h('p.quiz-verdict.' + (right ? 'good' : 'bad'), icon(right ? 'check' : 'x', 18), right ? 'Correct.' : `It was on ${t.square}.`));
    qi++;
    if (qi < targets.length) setTimeout(ask, 700);
    else { board.setPosition(fen); setTimeout(nextRound, 1800); }
  }
  window.addEventListener('hashchange', () => clearTimeout(timer), { once: true });
  board.setPosition('8/8/8/8/8/8/8/8 w - - 0 1', { animate: false });
  prompt.textContent = 'Three positions, three questions each.';
  return page('Position memory', crumbs('Position memory'),
    h('div.study', boardBox,
      h('div.study-text', h('h1', 'Position memory'), h('p', 'You get ten seconds to study each position. Then the board clears and you click where pieces stood.'),
        countdown, prompt, feedback, h('div.puzzle-actions', startBtn),
        h('p', h('a', { href: '#/guide/memory' }, 'How to remember positions and openings')))));
}

// ------------------------------------------------------------------ visualization: follow the moves
function visualize(data) {
  let round = 0, score = 0, target, timer;
  const boardBox = h('div.study-board');
  const board = new Board(boardBox, { label: 'Visualization board', onSquare: (sq) => answer(sq) });
  const movesEl = h('p.visual-moves', { 'aria-live': 'polite' });
  const prompt = h('h2.quiz-prompt');
  const feedback = h('div.quiz-feedback');
  const startBtn = h('button.btn.btn-primary', { type: 'button', onclick: () => { score = 0; round = 0; next(); } }, 'Start');
  const NAMES = { k: 'king', q: 'queen', r: 'rook', b: 'bishop', n: 'knight', p: 'pawn' };
  function next() {
    clearTimeout(timer);
    if (round >= 5) {
      const record = saveBest('visualize', score);
      prompt.textContent = `You scored ${score} of 5.`;
      feedback.replaceChildren(h('p', record ? 'New personal best!' : `Best: ${best('visualize')}/5.`));
      startBtn.textContent = 'Play again';
      return;
    }
    round++;
    const o = shuffle(data.openings)[0];
    const n = Math.min(o.mainLine.length, 4 + round); // longer each round
    const moves = o.mainLine.slice(0, n).map((m) => normMove(m).san);
    const c = new Chess();
    const hist = moves.map((s) => c.move(s));
    // pick a move whose piece is still on the board at the end; follow it to its final square
    const follow = (m) => { let sq = m.to; hist.slice(hist.indexOf(m) + 1).forEach((x) => { if (x.from === sq) sq = x.to; }); return sq; };
    const alive = hist.filter((m) => { const pc = c.get(follow(m)); return pc && pc.type === m.piece && pc.color === m.color; });
    const pool = alive.filter((m) => m.piece !== 'p');
    const piece = shuffle(pool.length ? pool : alive)[0];
    target = { sq: follow(piece), desc: `the ${piece.color === 'w' ? 'white' : 'black'} ${NAMES[piece.piece]} that played ${piece.san}` };
    board.setPosition(new Chess().fen(), { animate: false });
    prompt.textContent = `Round ${round}: follow ${n} moves in your head.`;
    feedback.replaceChildren();
    movesEl.textContent = '';
    let k = 0;
    const read = () => {
      if (!boardBox.isConnected) return;
      movesEl.textContent = lineText(moves.slice(0, k + 1));
      k++;
      if (k < moves.length) timer = setTimeout(read, 1300);
      else timer = setTimeout(() => { prompt.textContent = `Click the square of ${target.desc}.`; }, 900);
    };
    timer = setTimeout(read, 600);
  }
  function answer(sq) {
    if (!target || !prompt.textContent.startsWith('Click')) return;
    const right = sq === target.sq;
    if (right) score++;
    board.flash(sq, right ? 'good' : 'bad');
    if (!right) board.flash(target.sq, 'show');
    feedback.replaceChildren(h('p.quiz-verdict.' + (right ? 'good' : 'bad'), icon(right ? 'check' : 'x', 18), right ? 'Correct!' : `It is on ${target.sq}.`));
    prompt.textContent = 'Next round…';
    setTimeout(next, 1600);
  }
  window.addEventListener('hashchange', () => clearTimeout(timer), { once: true });
  board.setPosition(new Chess().fen(), { animate: false });
  prompt.textContent = 'Five rounds. Each line is one move longer.';
  return page('Follow the moves', crumbs('Follow the moves'),
    h('div.study', boardBox,
      h('div.study-text', h('h1', 'Follow the moves'), h('p', 'The board shows only the starting position. Moves appear as text — play them in your head, then click where a piece ended up.'),
        movesEl, prompt, feedback, h('div.puzzle-actions', startBtn))));
}

// ------------------------------------------------------------------ square colours
function colors() {
  let sq, score = 0, endAt = 0, raf = 0, running = false;
  const target = h('div.sq-target', '—');
  const scoreEl = h('span.sq-score', '0');
  const timeBar = h('div.sq-time', h('span'));
  const feedback = h('p.quiz-feedback');
  const isLight = (s) => ('abcdefgh'.indexOf(s[0]) + +s[1]) % 2 === 0;
  const pick = () => { sq = 'abcdefgh'[Math.floor(Math.random() * 8)] + (1 + Math.floor(Math.random() * 8)); target.textContent = sq; target.classList.remove('pop'); void target.offsetWidth; target.classList.add('pop'); };
  const guess = (light) => {
    if (!running) return;
    const right = isLight(sq) === light;
    if (right) { score++; scoreEl.textContent = score; }
    feedback.textContent = right ? '' : `${sq} is ${isLight(sq) ? 'light' : 'dark'}.`;
    pick();
  };
  const start = () => {
    running = true; score = 0; scoreEl.textContent = '0'; feedback.textContent = ''; pick();
    endAt = performance.now() + 30000;
    const tick = () => {
      const left = Math.max(0, endAt - performance.now());
      timeBar.firstChild.style.transform = `scaleX(${left / 30000})`;
      if (!target.isConnected) return;
      if (left <= 0) { running = false; target.textContent = '—'; const r = saveBest('colors', score); feedback.textContent = `${score} correct. ${r ? 'New best!' : `Best: ${best('colors')}.`}`; return; }
      raf = requestAnimationFrame(tick);
    };
    cancelAnimationFrame(raf); raf = requestAnimationFrame(tick);
  };
  const onKey = (e) => { if (!target.isConnected) return document.removeEventListener('keydown', onKey); if (e.key === 'l' || e.key === 'L') guess(true); if (e.key === 'd' || e.key === 'D') guess(false); };
  document.addEventListener('keydown', onKey);
  return page('Square colours', crumbs('Square colours'),
    h('section.colors-trainer',
      h('h1', 'Light or dark?'),
      h('p', 'Without looking at a board: is the square light or dark? Keys L and D work too. Hook: a1 is dark; a square is light when its file number (a=1…h=8) plus its rank is odd.'),
      h('div.sq-hud', h('div.sq-target-wrap', h('span.muted', 'Square'), target), h('div.sq-score-wrap', h('span.muted', 'Score'), scoreEl)),
      timeBar,
      h('div.color-buttons',
        h('button.color-btn.color-light', { type: 'button', onclick: () => guess(true) }, 'Light'),
        h('button.color-btn.color-dark', { type: 'button', onclick: () => guess(false) }, 'Dark')),
      feedback,
      h('button.btn.btn-primary', { type: 'button', onclick: start }, 'Start (30 seconds)')));
}
