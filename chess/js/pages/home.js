import { h, icon } from '../lib/dom.js';
import { LineViewer } from '../lib/viewer.js';
import { page, ring } from './common.js';
import { progress, best } from '../lib/store.js';

export function render(data) {
  const game = data.games[0];
  const p = progress();
  const seen = (kind) => Object.keys(p.seen).filter((k) => k.startsWith(kind + ':')).length;
  const variationCount = data.openings.reduce((n, o) => n + o.variations.length, 0);

  const heroBoard = h('div.hero-board');
  const caption = h('figcaption.hero-caption', h('strong', game.title), ' — ', game.players + ', ' + game.event);
  const hero = h('div.hero',
    h('div.hero-copy',
      h('h1.hero-title', 'Understand every move.'),
      h('p.hero-lede', 'A chess course that explains the reason behind each move. Step through openings and their variations, solve tactics, learn middlegame plans and essential endgames — then fix it all in memory with trainers.'),
      h('div.hero-actions',
        h('a.btn.btn-primary', { href: '#/openings' }, 'Start with openings'),
        h('a.btn', { href: '#/train/squares' }, 'Train board coordinates')),
      h('p.hero-lesson', game.lesson)),
    h('figure.hero-figure', heroBoard, caption));

  const viewer = new LineViewer(heroBoard, { autoplay: true, loop: true, speed: 1500, showSheet: false, label: 'The Opera Game, playing automatically' });
  viewer.load({ moves: game.moves, intro: 'Morphy has White. Watch how quickly his pieces join the game.' });

  const phase = (roman, href, title, range, desc, meta) =>
    h('a.phase', { href },
      h('span.phase-num', { 'aria-hidden': 'true' }, roman),
      h('span.phase-body', h('span.phase-title', title), h('span.phase-range', range), h('span.phase-desc', desc)),
      h('span.phase-meta', meta), icon('arrow', 22));

  return page('Home', hero,
    h('section.phases', { 'aria-label': 'The three phases of the game' },
      phase('I', '#/openings', 'Openings', 'Moves 1–12', 'Ten openings with annotated main lines, named variations, traps and the best replies.', `${data.openings.length} openings, ${variationCount} variations`),
      phase('II', '#/tactics', 'Middlegame', 'Moves 12–40', 'Fourteen tactical motifs to solve yourself, and nine strategic ideas that tell you what to aim for.', `${data.tactics.length} tactics, ${data.strategy.length} plans`),
      phase('III', '#/endgames', 'Endgames', 'Moves 40+', 'The checkmates, principles and positions every player needs: opposition, Lucena, Philidor and more.', `${data.endgames.length} lessons`)),
    h('section.home-split',
      h('div.home-train',
        h('h2', 'Make it stick'),
        h('ul.train-links',
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
        h('p.muted.small', p.streak.count > 1 ? `You've studied ${p.streak.count} days in a row.` : 'Progress is saved in this browser.'))));
}
