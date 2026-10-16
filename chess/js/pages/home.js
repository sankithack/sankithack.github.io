import { h, icon } from '../lib/dom.js';
import { LineViewer } from '../lib/viewer.js';
import { page, ring } from './common.js';
import { progress, best } from '../lib/store.js';
import { todayPlan, warmupOfDay } from './guide.js';

export function render(data) {
  const game = data.games[0];
  const p = progress();
  const seen = (kind) => Object.keys(p.seen).filter((k) => k.startsWith(kind + ':')).length;
  const variationCount = data.openings.reduce((n, o) => n + o.variations.length, 0);

  const heroBoard = h('div.hero-board');
  const caption = h('figcaption.hero-caption', h('strong', game.title), ' — ', game.players + ', ' + game.event + '. ', h('a', { href: '#/games' }, 'More classic games'));
  const hero = h('div.hero',
    h('div.hero-copy',
      h('h1.hero-title', 'Understand every move.'),
      h('p.hero-lede', 'A chess course that explains the reason behind each move. Step through openings and their variations, solve tactics, learn middlegame plans and essential endgames — then fix it all in memory with trainers.'),
      h('div.hero-actions',
        h('a.btn.btn-primary', { href: '#/guide' }, 'Follow the 500 → 2000+ roadmap'),
        h('a.btn', { href: '#/practice' }, 'Practise')),
      h('p.hero-lesson', game.lesson)),
    h('figure.hero-figure', heroBoard, caption));

  const viewer = new LineViewer(heroBoard, { autoplay: true, loop: true, speed: 1500, showSheet: false, keys: false, silent: true, label: 'The Opera Game, playing automatically' });
  viewer.load({ moves: game.moves, intro: 'Morphy has White. Watch how quickly his pieces join the game.' });

  const phase = (roman, href, title, range, desc, meta) =>
    h('a.phase', { href },
      h('span.phase-num', { 'aria-hidden': 'true' }, roman),
      h('span.phase-body', h('span.phase-title', title), h('span.phase-range', range), h('span.phase-desc', desc)),
      h('span.phase-meta', meta), icon('arrow', 22));

  const plan = todayPlan(data);
  const [warmHref, warmLabel] = warmupOfDay();
  const today = new Date().toISOString().slice(0, 10);
  const yesterday = new Date(Date.now() - 864e5).toISOString().slice(0, 10);
  const streak = p.streak.day === today ? p.streak.count : 0;
  const alive = p.streak.day === yesterday ? p.streak.count : 0; // still saveable today
  const todayCard = h('section.today', { 'aria-label': "Today's training" },
    h('div.today-head',
      h('div', h('h2', "Today's training"), h('p.muted', `Stage ${plan.index + 1}: ${plan.stage.range} — ${plan.stage.title}. ${plan.done} of ${plan.total} done.`)),
      h('div.streak' + (streak ? '.on' : ''), { title: 'Days in a row with study or practice' }, h('span.streak-num', String(streak || alive)), h('span.streak-label', streak ? 'day streak' : 'study today to keep your streak'))),
    h('ol.today-list',
      h('li', h('a', { href: warmHref }, h('span.today-kind', 'Warm-up'), warmLabel)),
      plan.items.map((r) => h('li', h('a', { href: r.href }, h('span.today-kind', 'Next step'), r.label)))),
    h('a.today-more', { href: '#/guide' }, 'See the whole roadmap'));

  return page('Home', hero, todayCard,
    h('section.phases', { 'aria-label': 'The three phases of the game' },
      phase('I', '#/openings', 'Openings', 'Moves 1–12', 'Ten openings with annotated main lines, named variations, traps and the best replies.', `${data.openings.length} openings, ${variationCount} variations`),
      phase('II', '#/tactics', 'Middlegame', 'Moves 12–40', 'Tactical motifs and mating patterns to solve yourself, strategic ideas that tell you what to aim for, and how to attack the king.', `${data.tactics.length} tactics, ${data.strategy.length} plans`),
      phase('III', '#/endgames', 'Endgames', 'Moves 40+', 'The checkmates, principles and positions every player needs: opposition, Lucena, Philidor and more.', `${data.endgames.length} lessons`)),
    h('section.home-split',
      h('div.home-train',
        h('h2', 'Make it stick'),
        h('ul.train-links',
          h('li', h('a', { href: '#/practice/openings' }, h('strong', 'Opening drills'), h('span', 'Play your side of any line from memory.'), h('em', 'Practise'))),
          h('li', h('a', { href: '#/guide/think' }, h('strong', 'How to think'), h('span', 'Candidate moves and calculating 3+ moves ahead, animated.'), h('em', 'Guide'))),
          h('li', h('a', { href: '#/train/squares' }, h('strong', 'Square trainer'), h('span', 'Find the named square before the clock runs out.'), h('em', `Best ${best('squares')}`))),
          h('li', h('a', { href: '#/train/quiz' }, h('strong', 'Quiz'), h('span', 'Name the opening, spot the tactic.'), h('em', `Best ${Math.max(best('quiz-openings'), best('quiz-tactics'), best('quiz-endgames'))}/10`))),
          h('li', h('a', { href: '#/train/cards' }, h('strong', 'Flashcards'), h('span', 'One-line memory hooks for every concept.'), h('em', `${Object.values(p.cards).filter((v) => v === 'known').length} known`))))),
      h('div.home-progress',
        h('h2', 'Your progress'),
        h('div.rings',
          ring(seen('opening'), data.openings.length, 'Openings studied'),
          ring(Object.keys(p.solved).length, data.tactics.length, 'Tactics solved'),
          ring(seen('strategy'), data.strategy.length, 'Plans read'),
          ring(seen('endgame'), data.endgames.length, 'Endgames studied')),
        h('p.muted.small', p.streak.count > 1 ? `You've studied ${p.streak.count} days in a row. ` : 'Progress is saved in this browser. ', h('a', { href: '#/progress' }, 'Back up or move your progress')))));
}
