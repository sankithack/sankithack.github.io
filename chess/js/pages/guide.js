// Guides: rating roadmap, how to think, memory techniques, attacking chess.
import { h, icon } from '../lib/dom.js';
import { Board } from '../lib/board.js';
import { LineViewer } from '../lib/viewer.js';
import { Chess, parseArrow, buildLine } from '../lib/line.js';
import { isSeen, isSolved, isMastered, best, progress } from '../lib/store.js';
import { page, pageHead, levelTag } from './common.js';

export function render(data, id, sub) {
  if (id === 'think') return think(data);
  if (id === 'memory') return memoryGuide(data);
  if (id === 'attack') return sub ? attackLesson(data, sub) : attackList(data);
  return roadmap(data);
}

// ------------------------------------------------------------------ roadmap
const T = (id) => ({ kind: 'tactic', id }), S = (id) => ({ kind: 'strategy', id }), E = (id) => ({ kind: 'endgame', id }),
  EP = (id) => ({ kind: 'endgame-practice', id }), O = (id) => ({ kind: 'opening', id }), D = (key, label, href) => ({ kind: 'drill', key, label, href }),
  A = (id) => ({ kind: 'attack', id }), B = (key, min, label, href) => ({ kind: 'best', key, min, label, href });

const STAGES = [
  { range: '500 → 800', title: 'Stop giving pieces away', focus: 'Most games at this level are lost by leaving pieces undefended or missing a one-move threat. Fix that and you climb fast.',
    daily: ['Before every move: what does my opponent\'s last move attack?', 'Before you let go of a piece: can it be taken for free?', '15 minutes of easy puzzles (forks, pins, mate in one).', 'Play 15+10 games, not bullet. Review every loss for the move where a piece was lost.'],
    repertoire: 'White: Italian Game or London System. Black: e5 vs 1.e4, d5 vs 1.d4 — keep it simple.',
    items: [B('squares', 15, 'Square trainer: 15+', '#/train/squares'), B('colors', 15, 'Square colours: 15+', '#/practice/colors'), S('opening-principles'), S('trading-when-ahead'),
      T('scholars-mate'), T('fork'), T('pin'), T('skewer'), T('back-rank-mate'), T('ladder-mate'), T('discovered-check'), T('trapped-piece'),
      EP('kq-vs-k'), EP('kr-vs-k'), O('italian')] },
  { range: '800 → 1200', title: 'Tactics every day', focus: 'Now games are decided by short tactics. Learn the motifs, scan for checks, captures and threats every move, and play a small, sound repertoire.',
    daily: ['20–30 minutes of puzzles; use the puzzle rush twice a week.', 'Use the candidate-move routine (checks, captures, threats) in every game.', 'Learn one opening line per week — play it, then drill it.', 'Play 15+10 or longer. Analyse each game yourself before using an engine.'],
    repertoire: 'White: Italian (main line + traps). Black: Caro-Kann or Scandinavian vs 1.e4; Queen\'s Gambit Declined or Slav vs 1.d4.',
    items: [T('discovered-attack'), T('removing-the-defender'), T('deflection'), T('decoy'), T('overloading'), T('arabian-mate'), T('smothered-mate'), T('anastasias-mate'),
      B('candidates', 70, 'Candidate moves: 70%+', '#/practice/candidates'), B('rush', 8, 'Puzzle rush: 8+', '#/practice/rush'),
      S('king-safety'), S('piece-activity'), S('open-files'), EP('opposition'), EP('rule-of-the-square'), EP('key-squares'),
      D('o:italian:main:0', 'Drill: Italian main line', '#/practice/opening/italian/main/0'), A('f7-sacrifice'), A('king-in-centre')] },
  { range: '1200 → 1500', title: 'Plans and patterns', focus: 'Tactics alone stop working against careful players. Learn what to do when nothing is hanging: pawn structure, good squares for pieces, and the key endgames.',
    daily: ['Puzzles at intermediate level, including mating patterns.', 'After each game write down the plan you had — and the plan you should have had.', 'One endgame lesson per week, practised against the computer.', 'Learn the main variations and traps of your openings.'],
    repertoire: 'Keep your openings; add the variations tab for each and drill the traps.',
    items: [T('x-ray'), T('zwischenzug'), T('interference'), T('double-check'), T('pawn-breakthrough'), T('greek-gift'), T('bodens-mate'),
      S('pawn-structure'), S('weak-squares'), S('outposts'), S('good-bad-bishop'), S('space'), S('pawn-majority'), S('bishop-pair'),
      EP('passed-pawns'), EP('two-bishops'), EP('lucena'), EP('philidor'), B('calculate', 10, 'Calculation: 10 solved', '#/practice/calculate'), B('strategy', 7, 'Find the square: 7/10', '#/practice/strategy')] },
  { range: '1500 → 1800', title: 'Calculate and understand', focus: 'Calculate three or more moves accurately, and understand the strategic ideas behind your openings. Endgame technique starts to win points.',
    daily: ['Calculation practice: solve without moving pieces, then check.', 'Visualisation drills (follow the moves, position memory).', 'Study one annotated master game a week — guess each move first.', 'Longer games (30+0 or classical) with a full post-mortem.'],
    repertoire: 'Learn the Advanced tab of each opening and one sharper weapon (e.g. Sicilian or King\'s Indian).',
    items: [T('windmill'), T('underpromotion'), S('initiative'), S('pawn-breaks'), S('blockade'), S('knight-vs-bishop'), S('prophylaxis'),
      EP('triangulation'), EP('rook-behind-pawn'), B('calculate', 25, 'Calculation: 25 solved', '#/practice/calculate'), B('visualize', 4, 'Follow the moves: 4/5', '#/practice/visualize'), B('memory', 6, 'Position memory: 6/9', '#/practice/memory'),
      A('pawn-storm'), A('trade-the-defender'), A('greek-gift')] },
  { range: '1800 → 2000+', title: 'Deep preparation and technique', focus: 'At 2000 players rarely blunder. Wins come from deeper opening knowledge, structures you understand better than your opponent, and converting small advantages.',
    daily: ['Mixed puzzles at advanced level; rush to stay sharp.', 'Prepare your openings to move 12–15 with ideas, not just moves.', 'Endgame studies and technique against the computer.', 'Classical games; analyse without an engine first, then compare.'],
    repertoire: 'A complete repertoire with variations mastered: drill every line of your main openings.',
    items: [S('iqp'), S('minority-attack'), S('opposite-bishops'), B('rush', 20, 'Puzzle rush: 20+', '#/practice/rush'), B('candidates', 90, 'Candidate moves: 90%+', '#/practice/candidates'),
      D('o:sicilian:main:0', 'Drill: Sicilian main line', '#/practice/opening/sicilian/main/0'), D('o:queens-gambit:main:0', 'Drill: Queen\'s Gambit main line', '#/practice/opening/queens-gambit/main/0'),
      D('o:ruy-lopez:variation:3', 'Drill: Marshall Attack', '#/practice/opening/ruy-lopez/variation/3'), D('o:nimzo-indian:main:0', 'Drill: Nimzo-Indian main line', '#/practice/opening/nimzo-indian/main/0')] },
];

function resolve(data, it) {
  const find = (list, id) => list.find((x) => x.id === id);
  switch (it.kind) {
    case 'tactic': { const t = find(data.tactics, it.id); return { label: `Solve: ${t.name}`, href: `#/tactics/${it.id}`, done: isSolved(it.id) }; }
    case 'strategy': { const s = find(data.strategy, it.id); return { label: `Read: ${s.name}`, href: `#/strategy/${it.id}`, done: isSeen('strategy', it.id) }; }
    case 'endgame': { const e = find(data.endgames, it.id); return { label: `Study: ${e.name}`, href: `#/endgames/${it.id}`, done: isSeen('endgame', it.id) }; }
    case 'endgame-practice': { const e = find(data.endgames, it.id); return { label: `Practise: ${e.name}`, href: `#/practice/endgame/${it.id}`, done: isMastered(`e:${it.id}`) }; }
    case 'opening': { const o = find(data.openings, it.id); return { label: `Study: ${o.name}`, href: `#/openings/${it.id}`, done: isSeen('opening', it.id) }; }
    case 'attack': { const a = find(data.attack, it.id); return { label: `Attack drill: ${a.name}`, href: `#/practice/attack/${it.id}`, done: isMastered(`a:${it.id}`) }; }
    case 'drill': return { label: it.label, href: it.href, done: isMastered(it.key) };
    case 'best': return { label: it.label, href: it.href, done: best(it.key) >= it.min };
    default: return { label: '?', href: '#/', done: false };
  }
}

/** Next steps for the home page: the first unfinished items of the current roadmap stage (then later stages). */
export function todayPlan(data, n = 3) {
  const stages = STAGES.map((s) => ({ ...s, rows: s.items.map((it) => resolve(data, it)) }));
  let cur = stages.findIndex((s) => s.rows.filter((r) => r.done).length / s.rows.length < 0.8);
  if (cur === -1) cur = stages.length - 1;
  const todo = stages.slice(cur).flatMap((s) => s.rows.filter((r) => !r.done)).slice(0, n);
  const st = stages[cur];
  return { stage: st, index: cur, items: todo, done: st.rows.filter((r) => r.done).length, total: st.rows.length };
}
const WARMUPS = [
  ['#/practice/rush', 'Puzzle rush — 3 minutes'], ['#/practice/candidates', 'Candidate moves — 3 positions'], ['#/train/squares', 'Square trainer — beat your best'],
  ['#/practice/colors', 'Square colours — 30 seconds'], ['#/practice/visualize', 'Follow the moves — 5 rounds'], ['#/practice/calculate', 'Calculate one combination'], ['#/practice/memory', 'Position memory — 3 positions'],
];
/** One warm-up per day, the same all day. */
export function warmupOfDay(date = new Date()) {
  const day = Math.floor((date.getTime() - date.getTimezoneOffset() * 6e4) / 864e5);
  return WARMUPS[day % WARMUPS.length];
}

function roadmap(data) {
  const stages = STAGES.map((s) => ({ ...s, rows: s.items.map((it) => resolve(data, it)) }));
  const current = stages.findIndex((s) => s.rows.filter((r) => r.done).length / s.rows.length < 0.8);
  const cur = current === -1 ? stages.length - 1 : current;
  const total = stages.reduce((n, s) => n + s.rows.length, 0), done = stages.reduce((n, s) => n + s.rows.filter((r) => r.done).length, 0);

  const ladder = h('ol.ladder', stages.map((s, i) => {
    const d = s.rows.filter((r) => r.done).length, pct = Math.round((d / s.rows.length) * 100);
    return h('li.stage' + (i === cur ? '.current' : i < cur ? '.past' : ''), { style: { '--i': i } },
      h('details', { open: i === cur },
        h('summary.stage-head',
          h('span.stage-range', s.range),
          h('h2.stage-title', s.title),
          h('span.stage-meter', h('span', { style: { '--pct': pct + '%' } })),
          h('span.stage-pct', `${d}/${s.rows.length}`)),
        h('div.stage-body',
          h('p.stage-focus', s.focus),
          h('div.two-col',
            h('div', h('h3', 'Every day'), h('ul.ticks', s.daily.map((x) => h('li', x)))),
            h('div', h('h3', 'Openings to play'), h('p', s.repertoire))),
          h('h3', 'Checklist — ticks itself as you go'),
          h('ul.checklist', s.rows.map((r) => h('li' + (r.done ? '.done' : ''), h('a', { href: r.href }, h('span.check', r.done ? icon('check', 14) : ''), r.label)))))));
  }));

  return page('Roadmap',
    pageHead('From 500 to 2000+', 'A step-by-step plan built from the lessons on this site. Each stage lists the habits to build and a checklist that fills in automatically as you study, solve and practise.',
      h('p.muted', `${done} of ${total} checklist items done. You are working on stage ${cur + 1}: ${stages[cur].range}.`)),
    h('div.road-links',
      h('a.btn', { href: '#/guide/think' }, icon('target', 16), 'How to think during a game'),
      h('a.btn', { href: '#/guide/memory' }, icon('eye', 16), 'How to remember positions'),
      h('a.btn', { href: '#/guide/attack' }, icon('flag', 16), 'How to attack')),
    ladder,
    h('section.road-notes',
      h('h2', 'What actually moves your rating'),
      h('ul.points',
        h('li', 'Play longer games. 15+10 or slower gives you time to use the thinking routine; bullet builds habits of guessing.'),
        h('li', 'Analyse every loss yourself first: find the move where it went wrong and why you chose it. Then check with an engine.'),
        h('li', 'Tactics first, always. Up to about 1600 most games are decided by tactics.'),
        h('li', 'Small repertoire, deep understanding. Know why each move is played (the notes on every line here).'),
        h('li', 'Rating ranges are rough guides. Progress depends on how much you play and review, not only on what you read.'))));
}

// ------------------------------------------------------------------ how to think
const THINK_FEN = '2rr2k1/pp3ppp/8/3N4/8/8/PP3PPP/4R1K1 w - - 0 1';
const THINK_STEPS = [
  { title: 'What did my opponent just do?', text: 'Black\'s last move put a rook on d8. It attacks your knight on d5. Always start by asking what the opponent\'s move threatens.', arrows: ['!d8d5'], squares: ['d5'] },
  { title: 'Checks, captures, threats — mine', text: 'List every forcing move: Ne7+ and Nf6+ are checks, Re8+ is a check too. Nb6 attacks a rook. Forcing moves come first because they limit the opponent\'s replies.', arrows: ['d5e7', 'd5f6', '~e1e8', '~d5b6'] },
  { title: 'Checks, captures, threats — theirs', text: 'What would Black do if it were their move? ...Rxd5 wins the knight. ...Rc1 is met by Rxc1. So the knight must move — ideally with a threat.', arrows: ['!d8d5', '!c8c1'] },
  { title: 'Pick 2–3 candidate moves', text: 'Candidates: Ne7+ (forks king and rook), Re8+ (a check that just loses the rook), Nf6+ (a check, but gxf6 takes the knight).', arrows: ['d5e7', '~e1e8', '~d5f6'] },
  { title: 'Calculate each — 3 moves deep', text: 'Re8+? Rxe8 — rook gone. Nf6+? gxf6 — knight gone. Ne7+! Kf8 Nxc8 Rxc8: you win the exchange. Calculate move by move and picture each position.', line: ['Ne7+', 'Kf8', 'Nxc8', 'Rxc8'] },
  { title: 'Blunder check, then play', text: 'In the final position: is anything hanging? Is your back rank safe? Black\'s ...Rc1+ is answered by Rxc1. Safe — play Ne7+.', arrows: ['d5e7'], squares: ['e7'] },
];

function think() {
  const boardBox = h('div.study-board');
  const board = new Board(boardBox, { label: 'Thinking routine example' });
  let step = 0, timer;
  const stepsEl = h('ol.think-steps');
  const textEl = h('div.viewer-note');
  const show = async (i) => {
    clearTimeout(timer);
    step = Math.max(0, Math.min(THINK_STEPS.length - 1, i));
    const s = THINK_STEPS[step];
    [...stepsEl.children].forEach((li, k) => { li.classList.toggle('on', k === step); li.classList.toggle('past', k < step); });
    textEl.replaceChildren(h('p.note-move', `${step + 1}. ${s.title}`), h('p', s.text));
    board.setPosition(THINK_FEN, { animate: true });
    board.setArrows((s.arrows || []).map(parseArrow));
    board.setKeySquares(s.squares || []);
    if (s.line) {
      const c = new Chess(THINK_FEN);
      for (const san of s.line) {
        await new Promise((r) => (timer = setTimeout(r, 900)));
        if (!boardBox.isConnected || step !== i) return;
        const mv = c.move(san);
        board.setPosition(c.fen(), { lastMove: { from: mv.from, to: mv.to } });
      }
    }
  };
  THINK_STEPS.forEach((s, i) => stepsEl.append(h('li', h('button', { type: 'button', onclick: () => show(i) }, s.title))));
  board.setPosition(THINK_FEN, { animate: false });
  show(0);
  return page('How to think',
    h('nav.crumbs', h('a', { href: '#/guide' }, 'Roadmap'), h('span', 'How to think')),
    pageHead('How to think during a game', 'A six-step routine strong players run on every serious move. Click through it on a real position — the board animates each step.'),
    h('div.study', h('div', boardBox, h('div.puzzle-actions.think-nav',
      h('button.btn', { type: 'button', onclick: () => show(step - 1) }, icon('prev', 16), 'Back'),
      h('button.btn.btn-primary', { type: 'button', onclick: () => show(step + 1) }, 'Next step', icon('next', 16)))),
      h('div.study-text', stepsEl, textEl)),
    h('section.guide-sections',
      h('article', h('h2', 'Candidate moves'),
        h('p', 'A candidate move is a move worth calculating. Find them in this order: checks, captures, threats — for you and for your opponent. Then add one quiet improving move (the worst-placed piece). Limit yourself to two or three, so you have time to calculate them properly.'),
        h('a.btn', { href: '#/practice/candidates' }, 'Practise finding candidates')),
      h('article', h('h2', 'Seeing 3+ moves ahead'),
        h('ol.steps',
          h('li', 'Calculate forcing lines first — they have few replies, so they are easier to see deeply.'),
          h('li', 'Say the moves to yourself in notation ("Ne7 check, king f8, knight takes c8") — it fixes the image.'),
          h('li', 'After each imagined move, update the picture: which squares are now empty? What does the moved piece attack?'),
          h('li', 'Assume the opponent finds their best reply. If your line only works against a bad reply, it is a hope, not a calculation.'),
          h('li', 'Stop at a quiet position and evaluate it: material, king safety, active pieces.')),
        h('a.btn', { href: '#/practice/calculate' }, 'Practise calculation'), ' ', h('a.btn', { href: '#/practice/visualize' }, 'Practise visualisation')),
      h('article', h('h2', 'Blunder check'),
        h('p', 'Before you touch a piece: "If I play this, what is my opponent\'s most forcing reply?" Check every check and capture they would have. This single habit is worth hundreds of rating points below 1500.'))));
}

// ------------------------------------------------------------------ memory
function memoryGuide(data) {
  const boardBox = h('div.study-board');
  const board = new Board(boardBox, { label: 'Chunking example' });
  const italian = data.openings.find((o) => o.id === 'italian');
  const frames = buildLine({ moves: italian.mainLine });
  board.setPosition(frames[frames.length - 1].fen, { animate: false });
  const CHUNKS = [
    { name: 'Castled king + pawn shield', squares: ['g1', 'f1', 'f2', 'g2', 'h2'] },
    { name: 'Centre pawns: e4/d3 vs e5/d6', squares: ['e4', 'd3', 'e5', 'd6'] },
    { name: 'Italian bishops aiming at f7/f2', squares: ['c4', 'c5', 'f7', 'f2'] },
    { name: 'Knights on f3/f6 and c6', squares: ['f3', 'f6', 'c6'] },
  ];
  let k = 0;
  const label = h('p.chunk-label', { 'aria-live': 'polite' });
  const cycle = () => { if (!boardBox.isConnected) return; const c = CHUNKS[k++ % CHUNKS.length]; board.setKeySquares(c.squares); label.textContent = c.name; setTimeout(cycle, 2200); };
  cycle();
  const tip = (title, text, href, cta) => h('article', h('h2', title), h('p', text), href ? h('a.btn', { href }, cta) : null);
  return page('Memory',
    h('nav.crumbs', h('a', { href: '#/guide' }, 'Roadmap'), h('span', 'Memory')),
    pageHead('How to remember positions and openings', 'Masters don\'t remember 32 pieces — they remember a handful of familiar patterns. Here is how to build that memory.'),
    h('div.study', h('div', boardBox, label),
      h('div.study-text',
        h('h2', 'Chunking'),
        h('p', 'Look at the board on the left: instead of 24 separate pieces, it is four chunks. Strong players see "castled king with a full pawn shield", "symmetrical centre", "bishops on c4 and c5" — and store each as one idea.'),
        h('p', 'Every pattern you learn (a mating pattern, a pawn structure, an opening set-up) becomes a chunk. That is why studying patterns improves memory and calculation at the same time.'))),
    h('section.guide-sections',
      tip('Learn the why, not just the moves', 'A move you understand is a move you remember. Read the note on every move of a line; if you can explain why Bb5 attacks the defender of e5, you will never forget the Ruy López.', '#/openings', 'Study openings'),
      tip('Play it, don\'t just watch it', 'Recall beats re-reading. Drill each line by playing your side from memory — the app tells you when you go wrong.', '#/practice/openings', 'Opening drills'),
      tip('Spaced repetition', 'Review what you almost forgot. Flashcards you mark "review again" come back first; cards you know come back later.', '#/train/cards', 'Flashcards'),
      tip('Build the mental board', 'Learn square names and colours until they are instant, then follow moves without a board. This is the foundation of calculating ahead.', '#/practice/colors', 'Square colours'),
      tip('Train position memory', 'Study a position for ten seconds, then recall it. Name the chunks out loud while you look.', '#/practice/memory', 'Position memory'),
      tip('Replay great games', 'Play through classic games guessing each move. The Opera Game on the home page is a perfect start.', '#/', 'The Opera Game')));
}

// ------------------------------------------------------------------ attack
function attackList(data) {
  return page('Attacking chess',
    h('nav.crumbs', h('a', { href: '#/guide' }, 'Roadmap'), h('span', 'Attack')),
    pageHead('How to attack', 'An attack succeeds when you bring more pieces to the enemy king than can defend it. Each lesson animates a classic attack; then you practise it as the attacker.'),
    h('section.attack-rules',
      h('ol.steps',
        h('li', h('strong', 'Find the target. '), 'An uncastled king, a weakened pawn shield (h6, g6, g5), or a missing defender (no knight on f6).'),
        h('li', h('strong', 'Open lines. '), 'Pawn storms, piece sacrifices and exchanges that open files and diagonals towards the king.'),
        h('li', h('strong', 'Bring more attackers than defenders. '), 'Count them. Add pieces with tempo (checks and threats) so the defender has no time.'),
        h('li', h('strong', 'Remove the defenders. '), 'Trade or deflect the pieces that guard the king (Bh6 against a fianchetto, Bxf6 against a knight).'),
        h('li', h('strong', 'Finish with a pattern. '), 'Mating patterns — Greek gift, Anastasia, Arabian, back rank — are where attacks end.'))),
    h('div.attack-grid', data.attack.map((a) => h('a.attack-card', { href: `#/guide/attack/${a.id}` },
      h('h3', a.name), levelTag(a.level), h('p.mnemonic-sm', a.mnemonic),
      h('span.train-meta', isMastered(`a:${a.id}`) ? 'Mastered' : 'Watch, then practise')))));
}

function attackLesson(data, id) {
  const a = data.attack.find((x) => x.id === id) || data.attack[0];
  const col = h('div.study-board');
  const v = new LineViewer(col, { autoplay: true, speed: 1500, orientation: a.side === 'b' ? 'black' : 'white', label: a.name });
  v.load({ fen: a.fen, moves: a.moves, intro: a.principle });
  const idx = data.attack.indexOf(a), next = data.attack[(idx + 1) % data.attack.length];
  return page(a.name,
    h('nav.crumbs', h('a', { href: '#/guide/attack' }, 'Attack'), h('span', a.name)),
    h('header.study-head', h('h1', a.name), levelTag(a.level), h('p.mnemonic', a.mnemonic)),
    h('div.study', col,
      h('div.study-text',
        h('p', a.principle),
        h('h2.h3', 'Key ideas'), h('ul.points', a.points.map((p) => h('li', p))),
        h('div.puzzle-actions',
          h('a.btn.btn-primary', { href: `#/practice/attack/${a.id}` }, icon('play', 16), 'Practise as the attacker'),
          h('a.btn', { href: `#/guide/attack/${next.id}` }, 'Next: ' + next.name)))));
}
