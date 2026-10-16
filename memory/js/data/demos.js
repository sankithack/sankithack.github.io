// Animated worked examples for every technique. Played by lib/demo.js.
// Examples read the user's own image lists, so they always match their system.
import { $in, $out, $cls, $anim } from '../lib/demo.js';
import { majorImage } from './major.js';
import { paoFor } from './pao.js';
import { cardImage, cardHTML } from './cards.js';
import { db } from '../storage.js';
import { esc } from '../utils.js';

// Picture hints for common images (falls back to the word alone).
const EMOJI = {
  sauce: '🥫', suit: '🤵', sun: '☀️', sumo: '🤼', seal: '🦭', sushi: '🍣', sock: '🧦', sofa: '🛋️', soap: '🧼',
  toes: '🦶', tide: '🌊', tuna: '🐟', tire: '🛞', doll: '🪆', dish: '🍽️', duck: '🦆', dove: '🕊️', tub: '🛁',
  nose: '👃', net: '🥅', nail: '💅', knife: '🔪', mouse: '🐭', moon: '🌙', mule: '🫏', mug: '☕', movie: '🎬', map: '🗺️',
  rose: '🌹', rat: '🐀', rain: '🌧️', ram: '🐏', roach: '🪳', rock: '🪨', roof: '🏠', rope: '🪢', light: '💡',
  lion: '🦁', lime: '🍋', lorry: '🚚', leech: '🪱', log: '🪵', lava: '🌋', lip: '👄', cheese: '🧀', sheet: '📄',
  chain: '⛓️', chair: '🪑', judge: '⚖️', chick: '🐤', chef: '👨‍🍳', ship: '🚢', goose: '🪿', cat: '🐈', coin: '🪙',
  comb: '🪮', car: '🚗', cake: '🎂', cap: '🧢', vase: '🏺', foot: '🦶', fan: '🪭', foam: '🫧', fire: '🔥', file: '📁',
  fish: '🐠', fog: '🌫️', bus: '🚌', bat: '🦇', bone: '🦴', bomb: '💣', bear: '🐻', bell: '🔔', beach: '🏖️', book: '📖',
  beef: '🥩', snake: '🐍', smoke: '💨', sword: '🗡️', slide: '🛝', skate: '⛸️', spoon: '🥄', hat: '🎩', honey: '🍯',
  hammer: '🔨', helmet: '⛑️', hedgehog: '🦔', hook: '🪝', hippo: '🦛', donut: '🍩', door: '🚪', dolphin: '🐬',
  dog: '🐕', devil: '😈', dice: '🎲', kite: '🪁', canoe: '🛶', camel: '🐫', crown: '👑', clock: '⏰', cookie: '🍪',
  coffee: '☕', cupcake: '🧁', kiss: '💋', witch: '🧙', bride: '👰', princess: '👸', cupid: '💘', golfer: '🏌️',
  gardener: '🧑‍🌾', eggs: '🥚', milk: '🥛', bread: '🍞', batteries: '🔋', roses: '🌹', apple: '🍎', rocket: '🚀',
  violin: '🎻', penguin: '🐧', umbrella: '☂️', piano: '🎹', cactus: '🌵', ticket: '🎟️', saddle: '🐎', safe: '🔐',
};
export const emoji = (word) => EMOJI[String(word).toLowerCase()] || '';
const chip = (word, extra = '') => `<span class="d-chip ${extra}">${emoji(word) ? `<i>${emoji(word)}</i>` : ''}${esc(word)}</span>`;

const userLoci = (n, fallback) => {
  const p = db().palaces.find((x) => x.loci.length >= n);
  return p ? p.loci.slice(0, n) : fallback.slice(0, n);
};

/* ---------- Route demo: a floor plan, a walker and images at each locus ---------- */
const PLAN = [
  { x: 12, y: 82 }, { x: 31, y: 82 }, { x: 31, y: 34 }, { x: 56, y: 32 }, { x: 84, y: 32 }, { x: 72, y: 80 },
];

function routeStage(loci, items) {
  const pts = PLAN.slice(0, loci.length);
  const path = pts.map((p, i) => `${i ? 'L' : 'M'}${p.x * 1.6} ${p.y * 0.9}`).join(' ');
  return `
    <svg class="d-plan" viewBox="0 0 160 90" preserveAspectRatio="none" aria-hidden="true">
      <rect x="2" y="2" width="58" height="86" rx="2"/><rect x="60" y="2" width="98" height="44" rx="2"/><rect x="60" y="46" width="98" height="42" rx="2"/>
      <path class="d-route" d="${path}" pathLength="1"/>
    </svg>
    <span class="d-room" style="left:13%;top:46%">Hall</span><span class="d-room" style="left:69%;top:44%">Kitchen</span><span class="d-room" style="left:87%;top:56%">Living room</span>
    ${pts.map((p, i) => `
      <span class="d-locus d-pop" data-l="${i}" style="left:${p.x}%;top:${p.y}%"><b>${i + 1}</b><small>${esc(loci[i])}</small></span>
      <span class="d-item d-pop" data-it="${i}" style="left:${p.x}%;top:${p.y - 17}%">${items[i].map((w) => chip(w)).join('')}</span>`).join('')}
    <span class="d-walker" style="left:${pts[0].x - 6}%;top:${pts[0].y}%">🚶</span>`;
}

const walkTo = (stage, i) => {
  const w = stage.querySelector('.d-walker');
  w.style.left = `${PLAN[i].x}%`;
  w.style.top = `${PLAN[i].y}%`;
  $cls(stage, '.d-locus', 'here', false);
  $cls(stage, `.d-locus[data-l="${i}"]`, 'here');
};

function routeDemo({ title, loci, items, captions, intro }) {
  const steps = [
    { caption: intro, apply: (s) => { $in(s, '.d-locus'); }, ms: 2800 },
    { caption: 'Walk the route, always in the same direction. The order of the loci gives you the order of the items.', apply: (s) => $in(s, '.d-route'), ms: 2600 },
    ...loci.map((l, i) => ({
      caption: `<b>Locus ${i + 1}, ${esc(l)}:</b> ${captions[i]}`,
      apply: (s) => { walkTo(s, i); $in(s, `.d-item[data-it="${i}"]`); $anim(s, `.d-item[data-it="${i}"]`, 'd-shake'); },
      ms: 3600,
    })),
    {
      caption: '<b>Recall:</b> later, walk the same route in your mind…',
      apply: (s) => { $cls(s, '.d-item', 'd-dim'); const w = s.querySelector('.d-walker'); w.style.left = `${PLAN[0].x - 6}%`; w.style.top = `${PLAN[0].y}%`; $cls(s, '.d-locus', 'here', false); },
      ms: 2400,
    },
    {
      caption: `…and every image is waiting where you left it: <b>${items.flat().map(esc).join(', ')}</b>.`,
      apply: (s) => { walkTo(s, loci.length - 1); $cls(s, '.d-item', 'd-dim', false); $anim(s, '.d-item', 'd-bounce'); },
      ms: 3000,
    },
  ];
  return { title, stage: () => routeStage(loci, items), steps };
}

/* ---------- Digit-tile helpers ---------- */
const tiles = (digits, cls = '') => [...digits].map((d, i) => `<span class="d-tile ${cls}" data-d="${i}">${d}</span>`).join('');

/* ---------- The demos ---------- */
export const DEMOS = {
  palace: () => routeDemo({
    title: 'A shopping list in a memory palace',
    loci: ['Front door', 'Doormat', 'Coat hook', 'Mirror', 'Kitchen sink'],
    items: [['eggs'], ['milk'], ['bread'], ['batteries'], ['roses']],
    intro: 'Here is a memory palace: a home you know, with <b>5 loci</b> (fixed spots) along a route.',
    captions: [
      'giant <b>eggs</b> smash against the door; yolk drips down the handle.',
      'the mat is a soggy sponge that squirts <b>milk</b> up your legs.',
      'a long baguette (<b>bread</b>) hangs where your coat should be, and you put it on.',
      '<b>batteries</b> spark out of the mirror and zap your reflection.',
      'the tap gushes thorny red <b>roses</b> that prick your hands.',
    ],
  }),

  images: () => ({
    title: 'From a forgettable image to an unforgettable one',
    stage: () => `
      <div class="d-split">
        <div class="d-panel" data-p="weak"><span class="d-label">Weak</span>
          <span class="d-emo d-pop" style="left:38%;top:58%;font-size:2rem">🐕</span><span class="d-emo d-pop" style="left:64%;top:58%;font-size:2rem">🎹</span></div>
        <div class="d-panel" data-p="strong"><span class="d-label">Strong</span>
          <span class="d-emo d-pop" data-e="piano" style="left:60%;top:62%;font-size:3rem">🎹</span>
          <span class="d-emo d-pop d-dog" style="left:28%;top:58%;font-size:2rem">🐕</span>
          <span class="d-emo d-pop" data-e="hat" style="left:52%;top:30%;font-size:1.6rem">🎩</span>
          <span class="d-bubble d-pop" style="left:78%;top:22%">YELP!</span>
          <span class="d-emo d-pop" data-e="crowd" style="left:50%;top:90%;font-size:1.2rem">👏👏👏</span></div>
      </div>`,
    steps: [
      { caption: 'Task: link <b>dog</b> and <b>piano</b>. <b>Weak:</b> a dog sitting next to a piano. Sensible, and gone in minutes.', apply: (s) => $in(s, '[data-p="weak"] .d-pop'), ms: 3200 },
      { caption: '<b>Exaggerate:</b> a giant dog, bigger than the grand piano.', apply: (s) => { $cls(s, '[data-p="weak"]', 'd-dim'); $in(s, '[data-e="piano"], .d-dog'); s.querySelector('.d-dog').classList.add('big'); }, ms: 2800 },
      { caption: '<b>Action:</b> it leaps onto the keys and pounds them with its paws.', apply: (s) => { s.querySelector('.d-dog').classList.add('jump'); $anim(s, '[data-e="piano"]', 'd-shake'); }, ms: 2800 },
      { caption: '<b>Emotion and sound:</b> the lid slams on its tail and it howls, in perfect pitch.', apply: (s) => { $in(s, '.d-bubble'); $anim(s, '.d-bubble', 'd-shake'); }, ms: 2800 },
      { caption: '<b>Humor:</b> it is wearing a top hat and bows to a cheering crowd.', apply: (s) => { $in(s, '[data-e="hat"], [data-e="crowd"]'); $anim(s, '[data-e="crowd"]', 'd-bounce'); }, ms: 2800 },
      { caption: 'Same two words, but now one strange, moving, noisy scene. <b>That</b> is what sticks.', apply: (s) => $cls(s, '[data-p="strong"]', 'd-glow'), ms: 3000 },
    ],
  }),

  major: () => {
    const a = majorImage('32'); const b = majorImage('71');
    return {
      title: 'Turning 3271 into pictures with the Major System',
      stage: () => `
        <div class="d-row d-num">${tiles('32', 'p0')}<span class="d-gap"></span>${tiles('71', 'p1')}</div>
        <div class="d-row d-sounds">
          <span class="d-snd d-drop">m</span><span class="d-snd d-drop">n</span><span class="d-gap"></span><span class="d-snd d-drop">k</span><span class="d-snd d-drop">t</span>
        </div>
        <div class="d-row d-words"><span class="d-word d-pop" data-w="0">${chip(a, 'lg')}</span><span class="d-gap wide"></span><span class="d-word d-pop" data-w="1">${chip(b, 'lg')}</span></div>
        <div class="d-scene d-pop">${emoji(b) ? `<span class="d-leap">${emoji(b)}</span>` : ''}${emoji(a) ? `<span>${emoji(a)}</span>` : ''}<p>${esc(b)} leaping at the ${esc(a)}</p></div>`,
      steps: [
        { caption: 'Take the number <b>3271</b>. Four digits, nothing to picture… yet.', apply: (s) => $in(s, '.d-tile'), ms: 2400 },
        { caption: 'Split it into <b>pairs</b>: 32 and 71. Each pair will become one image.', apply: (s) => $cls(s, '.d-num', 'split'), ms: 2400 },
        { caption: 'Swap each digit for its <b>sound</b>: 3 → <b>m</b>, 2 → <b>n</b>.', apply: (s) => { const x = s.querySelectorAll('.d-snd'); x[0].classList.add('in'); x[1].classList.add('in'); $cls(s, '.p0', 'hl'); }, ms: 2600 },
        { caption: `Add vowels to make a word: m–n → <b>${esc(a)}</b> (your image for 32).`, apply: (s) => { $in(s, '[data-w="0"]'); $cls(s, '.p0', 'hl', false); }, ms: 2800 },
        { caption: `Same for 71: 7 → <b>k</b>, 1 → <b>t</b> → <b>${esc(b)}</b>.`, apply: (s) => { const x = s.querySelectorAll('.d-snd'); x[2].classList.add('in'); x[3].classList.add('in'); $in(s, '[data-w="1"]'); }, ms: 3000 },
        { caption: `Join them in one scene at a locus: <b>a ${esc(b)} leaping at the ${esc(a)}</b>. Picture it, and 3271 is stored.`, apply: (s) => { $cls(s, '.d-sounds, .d-num', 'd-dim'); $in(s, '.d-scene'); }, ms: 3400 },
      ],
    };
  },

  pao: () => {
    const p = paoFor('34'); const a = paoFor('71'); const o = paoFor('05');
    return {
      title: 'Six digits, one scene: 347105 with PAO',
      stage: () => `
        <div class="d-row d-num">${tiles('34', 'p0')}<span class="d-gap"></span>${tiles('71', 'p1')}<span class="d-gap"></span>${tiles('05', 'p2')}</div>
        <div class="d-pao">
          <div class="d-paorow d-drop" data-r="0"><span class="mono">34</span><small>Person</small><b>${esc(p.p)}</b><s>${esc(p.a)} · ${esc(p.o)}</s></div>
          <div class="d-paorow d-drop" data-r="1"><span class="mono">71</span><small>Action</small><s>${esc(a.p)} ·</s><b>${esc(a.a)}</b><s>· ${esc(a.o)}</s></div>
          <div class="d-paorow d-drop" data-r="2"><span class="mono">05</span><small>Object</small><s>${esc(o.p)} · ${esc(o.a)} ·</s><b>${esc(o.o)}</b></div>
        </div>
        <div class="d-scene d-pop"><p>${esc(p.p)} <i>${esc(a.a)}</i> a ${esc(o.o)} ${emoji(o.o)}</p></div>`,
      steps: [
        { caption: 'The number <b>347105</b>, split into three pairs.', apply: (s) => { $in(s, '.d-tile'); $cls(s, '.d-num', 'split'); }, ms: 2400 },
        { caption: `The <b>1st pair</b> gives the <b>person</b>: 34 → ${esc(p.p)}.`, apply: (s) => { $in(s, '[data-r="0"]'); $cls(s, '.p0', 'hl'); }, ms: 2600 },
        { caption: `The <b>2nd pair</b> gives the <b>action</b>: 71 → ${esc(a.a)}.`, apply: (s) => { $in(s, '[data-r="1"]'); $cls(s, '.p0', 'hl', false); $cls(s, '.p1', 'hl'); }, ms: 2600 },
        { caption: `The <b>3rd pair</b> gives the <b>object</b>: 05 → ${esc(o.o)}.`, apply: (s) => { $in(s, '[data-r="2"]'); $cls(s, '.p1', 'hl', false); $cls(s, '.p2', 'hl'); }, ms: 2600 },
        { caption: `One scene holds all six digits: <b>${esc(p.p)} ${esc(a.a)} a ${esc(o.o)}</b>. Put it on one locus.`, apply: (s) => { $cls(s, '.p2', 'hl', false); $cls(s, '.d-pao', 'd-dim'); $in(s, '.d-scene'); }, ms: 3400 },
      ],
    };
  },

  cards: () => {
    const cards = ['5D', '2C', '9H', 'AS'];
    const imgs = cards.map(cardImage);
    const loci = userLoci(2, ['Front door', 'Doormat']);
    return {
      title: 'Four cards, two loci',
      stage: () => `
        <div class="d-cards">${cards.map((c, i) => `
          <div class="d-card" data-c="${i}">
            <div class="d-flip"><div class="d-front">${cardHTML(c, { size: 'md' })}</div><div class="d-back">${chip(imgs[i], 'lg')}</div></div>
          </div>`).join('')}</div>
        <div class="d-loci">
          <div class="d-lbox d-pop" data-b="0"><small>Locus 1 · ${esc(loci[0])}</small>${emoji(imgs[0])}${emoji(imgs[1])} <b>${esc(imgs[0])}</b> paddling a <b>${esc(imgs[1])}</b></div>
          <div class="d-lbox d-pop" data-b="1"><small>Locus 2 · ${esc(loci[1])}</small>${emoji(imgs[2])}${emoji(imgs[3])} <b>${esc(imgs[2])}</b> wearing a <b>${esc(imgs[3])}</b></div>
        </div>`,
      steps: [
        { caption: 'A shuffled run of cards is dealt…', apply: (s) => $in(s, '.d-card'), ms: 2200 },
        ...cards.map((c, i) => ({
          caption: `Each card instantly becomes your image: <b>${esc(c.replace('D', '♦').replace('C', '♣').replace('H', '♥').replace('S', '♠'))}</b> → <b>${esc(imgs[i])}</b>.`,
          apply: (s) => s.querySelector(`[data-c="${i}"]`).classList.add('flipped'),
          ms: 1900,
        })),
        { caption: `Two cards per locus, interacting: at ${esc(loci[0])}, a <b>${esc(imgs[0])}</b> paddling a <b>${esc(imgs[1])}</b>.`, apply: (s) => { $in(s, '[data-b="0"]'); $cls(s, '[data-c="0"], [data-c="1"]', 'hl'); }, ms: 3000 },
        { caption: `At ${esc(loci[1])}, a <b>${esc(imgs[2])}</b> wearing a <b>${esc(imgs[3])}</b>. To recall, walk the loci and rebuild the order.`, apply: (s) => { $in(s, '[data-b="1"]'); $cls(s, '[data-c="0"], [data-c="1"]', 'hl', false); $cls(s, '[data-c="2"], [data-c="3"]', 'hl'); }, ms: 3400 },
      ],
    };
  },

  names: () => ({
    title: 'Remembering “Rosa Fischer”',
    stage: () => `
      <div class="d-face">
        <img src="faces/demo-rosa.jpg" alt="Face of the person to remember">
        <span class="d-ring d-fade"></span>
        <span class="d-emo d-pop" style="left:30%;top:30%">🌹</span><span class="d-emo d-pop" style="left:50%;top:27%">🌹</span><span class="d-emo d-pop" style="left:70%;top:30%">🌹</span>
        <span class="d-emo d-pop d-fishy" style="left:50%;top:26%">🐟</span>
      </div>
      <div class="d-namecard">
        <div class="d-nm d-drop">Rosa Fischer</div>
        <div class="d-step d-drop" data-s="0"><b>Feature</b> bright red fringe</div>
        <div class="d-step d-drop" data-s="1"><b>Rosa</b> → roses 🌹</div>
        <div class="d-step d-drop" data-s="2"><b>Fischer</b> → fisher 🐟</div>
        <div class="d-step d-drop" data-s="3"><b>Scene</b> roses sprout from her fringe; a fish leaps out</div>
      </div>`,
    steps: [
      { caption: 'You meet <b>Rosa Fischer</b>. A name alone is just a sound…', apply: (s) => $in(s, '.d-nm'), ms: 2600 },
      { caption: '<b>1. Pick a feature</b> that stands out: her bright red fringe.', apply: (s) => { $in(s, '.d-ring, [data-s="0"]'); }, ms: 2800 },
      { caption: '<b>2. Turn the first name into an image:</b> Rosa sounds like <b>roses</b>.', apply: (s) => { $in(s, '[data-s="1"]'); }, ms: 2600 },
      { caption: '<b>3. Link it to the feature:</b> red roses sprout out of her red fringe.', apply: (s) => { s.querySelectorAll('.d-face .d-pop:not(.d-fishy)').forEach((e) => e.classList.add('in')); }, ms: 3000 },
      { caption: '<b>4. Add the surname:</b> Fischer → a <b>fisher</b>’s fish leaps out of the roses.', apply: (s) => { $in(s, '[data-s="2"], .d-fishy'); s.querySelector('.d-fishy').classList.add('leap'); }, ms: 3000 },
      { caption: 'Next time you see that fringe, the roses and the fish bring back <b>Rosa Fischer</b>.', apply: (s) => { $in(s, '[data-s="3"]'); $anim(s, '.d-face .d-emo', 'd-bounce'); }, ms: 3400 },
    ],
  }),

  numbers: () => {
    const digits = '58201946';
    const pairs = digits.match(/../g);
    const imgs = pairs.map(majorImage);
    const loci = userLoci(2, ['Front door', 'Doormat']);
    return routeDemoDigits({ title: 'Speed Numbers: 8 digits on 2 loci', digits, pairs, imgs, loci });
  },

  binary: () => {
    const groups = ['101', '011', '110', '001'];
    const dec = groups.map((g) => String(parseInt(g, 2)));
    const pairs = [dec[0] + dec[1], dec[2] + dec[3]];
    const imgs = pairs.map(majorImage);
    return {
      title: 'Binary: 12 digits become 2 images',
      stage: () => `
        <div class="d-row d-num">${groups.map((g, i) => `<span class="d-bgrp" data-g="${i}">${tiles(g)}</span>`).join('<span class="d-gap"></span>')}</div>
        <div class="d-row">${dec.map((d, i) => `<span class="d-snd d-drop" data-dec="${i}">${d}</span>`).join('<span class="d-gap wide"></span>')}</div>
        <div class="d-row d-words">${imgs.map((w, i) => `<span class="d-word d-pop" data-w="${i}"><small class="mono">${pairs[i]}</small>${chip(w, 'lg')}</span>`).join('<span class="d-gap wide"></span>')}</div>`,
      steps: [
        { caption: '<b>101011110001</b>: twelve binary digits.', apply: (s) => $in(s, '.d-tile'), ms: 2200 },
        { caption: 'Read them in groups of <b>three</b>.', apply: (s) => $cls(s, '.d-num', 'split'), ms: 2200 },
        ...groups.map((g, i) => ({ caption: `<b>${g}</b> = ${g.split('').map((b, k) => (b === '1' ? [4, 2, 1][k] : 0)).filter(Boolean).join(' + ') || '0'} = <b>${dec[i]}</b> (the places are worth 4, 2, 1).`, apply: (s) => { $in(s, `[data-dec="${i}"]`); $cls(s, '.d-bgrp', 'hl', false); $cls(s, `[data-g="${i}"]`, 'hl'); }, ms: 2300 })),
        { caption: `Now it’s ordinary digits: <b>${pairs[0]}</b> → ${esc(imgs[0])}, <b>${pairs[1]}</b> → ${esc(imgs[1])}. Twelve binary digits, just two images.`, apply: (s) => { $cls(s, '.d-bgrp', 'hl', false); $in(s, '.d-word'); }, ms: 3400 },
      ],
    };
  },

  spoken: () => {
    const digits = '4139';
    const words = ['four', 'one', 'three', 'nine'];
    const imgs = [majorImage('41'), majorImage('39')];
    return {
      title: 'Spoken Numbers: catching digits in pairs',
      stage: () => `
        <div class="d-speaker">🔊 <span class="d-said"></span></div>
        <div class="d-row d-num">${tiles(digits)}</div>
        <div class="d-row d-words">${imgs.map((w, i) => `<span class="d-word d-pop" data-w="${i}">${chip(w, 'lg')}</span>`).join('<span class="d-gap wide"></span>')}</div>`,
      steps: [
        ...words.map((w, i) => ({
          caption: i % 2 === 0 ? `You hear “<b>${w}</b>”. Hold it for a moment…` : `“<b>${w}</b>” completes the pair <b>${digits.slice(i - 1, i + 1)}</b> → see <b>${esc(imgs[(i - 1) / 2])}</b> and drop it at the next locus.`,
          apply: (s) => {
            s.querySelector('.d-said').textContent = `“${w}”`;
            $anim(s, '.d-speaker', 'd-bounce');
            s.querySelector(`[data-d="${i}"]`).classList.add('in');
            if (i % 2 === 1) $in(s, `[data-w="${(i - 1) / 2}"]`);
          },
          ms: 2000,
        })),
        { caption: 'One digit per second, no replays. Pair → image → locus, and keep going even if you miss one.', apply: (s) => { s.querySelector('.d-said').textContent = ''; $anim(s, '.d-word', 'd-bounce'); }, ms: 3000 },
      ],
    };
  },

  dates: () => {
    const cent = majorImage('19'); const yr = majorImage('69');
    return {
      title: 'Dates: 1969, “A singing cactus wins the lottery”',
      stage: () => `
        <div class="d-row"><span class="d-event d-pop">🌵 A singing cactus wins the lottery</span></div>
        <div class="d-row d-num">${tiles('19', 'p0')}<span class="d-gap"></span>${tiles('69', 'p1')}</div>
        <div class="d-row d-words"><span class="d-word d-pop" data-w="0">${chip(cent, 'lg')}</span><span class="d-gap wide"></span><span class="d-word d-pop" data-w="1">${chip(yr, 'lg')}</span></div>
        <div class="d-scene d-pop"><p>🌵🎟️ the cactus sings in a ${esc(cent)} on the deck of a ${esc(yr)}, waving its lottery ticket</p></div>`,
      steps: [
        { caption: 'An event and its year. Take a <b>keyword</b> from the event: the singing <b>cactus</b>.', apply: (s) => $in(s, '.d-event'), ms: 2600 },
        { caption: 'Split the year into two pairs: <b>19</b> and <b>69</b>.', apply: (s) => { $in(s, '.d-tile'); $cls(s, '.d-num', 'split'); }, ms: 2400 },
        { caption: `Turn the pairs into images: 19 → <b>${esc(cent)}</b>, 69 → <b>${esc(yr)}</b>.`, apply: (s) => $in(s, '.d-word'), ms: 2800 },
        { caption: `Make the keyword interact with both: <b>the cactus sings in a ${esc(cent)} on a ${esc(yr)}</b>. The event text is your cue, so no palace is needed.`, apply: (s) => { $cls(s, '.d-num, .d-words', 'd-dim'); $in(s, '.d-scene'); }, ms: 3600 },
      ],
    };
  },

  phone: () => {
    const num = '2124873051';
    const pairs = num.match(/../g);
    const imgs = pairs.map(majorImage);
    return {
      title: 'Phone numbers: Leo Bell, (212) 487-3051',
      stage: () => `
        <div class="d-row"><span class="d-event d-pop">🦁🔔 Leo Bell · <span class="mono">(212) 487-3051</span></span></div>
        <div class="d-row d-num">${pairs.map((p, i) => `<span class="d-bgrp" data-g="${i}">${tiles(p)}</span>`).join('<span class="d-gap"></span>')}</div>
        <div class="d-row d-words small-chips">${imgs.map((w, i) => `<span class="d-word d-pop" data-w="${i}">${chip(w)}</span>`).join('')}</div>
        <div class="d-scene d-pop"><p>A lion (Leo) ringing a bell (Bell) walks through his house: ${imgs.map(esc).join(' → ')}</p></div>`,
      steps: [
        { caption: 'Start with the <b>person</b>: Leo → a lion 🦁, Bell → a bell 🔔. He becomes the star of the story.', apply: (s) => $in(s, '.d-event'), ms: 2800 },
        { caption: 'Split the 10 digits into five pairs.', apply: (s) => { $in(s, '.d-tile'); $cls(s, '.d-num', 'split'); }, ms: 2200 },
        ...pairs.map((p, i) => ({ caption: `<b>${p}</b> → ${esc(imgs[i])}`, apply: (s) => { $cls(s, '.d-bgrp', 'hl', false); $cls(s, `[data-g="${i}"]`, 'hl'); $in(s, `[data-w="${i}"]`); }, ms: 1500 })),
        { caption: 'The lion meets each image in order on a short walk through his house: one number, one mini journey.', apply: (s) => { $cls(s, '.d-bgrp', 'hl', false); $in(s, '.d-scene'); }, ms: 3600 },
      ],
    };
  },

  words: () => routeDemo({
    title: 'Random Words: one word per locus',
    loci: userLoci(5, ['Front door', 'Doormat', 'Coat hook', 'Mirror', 'Kitchen sink']),
    items: [['apple'], ['rocket'], ['violin'], ['penguin'], ['umbrella']],
    intro: 'Five random words and five loci from your palace.',
    captions: [
      'a giant <b>apple</b> is wedged in the doorway; you have to bite through it.',
      'a <b>rocket</b> blasts off from here, scorching your shoes.',
      'a <b>violin</b> plays itself, screeching, hanging off it.',
      'a <b>penguin</b> slides into it and gets stuck, flapping.',
      'an <b>umbrella</b> pops open out of it and sprays water everywhere.',
    ],
  }),
};

// Two images per locus, with the digits shown above the plan.
function routeDemoDigits({ title, digits, pairs, imgs, loci }) {
  const items = [[imgs[0], imgs[1]], [imgs[2], imgs[3]]];
  const base = routeDemo({
    title,
    loci,
    items,
    intro: `The digits <b>${digits.match(/..../g).join(' ')}</b> become four pair-images: ${pairs.map((p, i) => `${p} → ${esc(imgs[i])}`).join(', ')}.`,
    captions: [
      `<b>${pairs[0]} ${pairs[1]}</b>: the ${esc(imgs[0])} and the ${esc(imgs[1])} collide right here.`,
      `<b>${pairs[2]} ${pairs[3]}</b>: the ${esc(imgs[2])} and the ${esc(imgs[3])} fight over this spot.`,
    ],
  });
  return base;
}

export const DEMO_LIST = [
  ['palace', 'Memory palace', 'learn/palace'],
  ['images', 'Vivid images', 'learn/images'],
  ['major', 'Major System', 'learn/major'],
  ['pao', 'PAO', 'learn/pao'],
  ['cards', 'Cards', 'learn/cards'],
  ['names', 'Names & faces', 'learn/names'],
  ['numbers', 'Speed Numbers', 'events/numbers'],
  ['binary', 'Binary digits', 'events/binary'],
  ['spoken', 'Spoken numbers', 'events/spoken'],
  ['words', 'Random words', 'events/words'],
  ['dates', 'Dates', 'events/dates'],
  ['phone', 'Phone numbers', 'events/phone'],
];
