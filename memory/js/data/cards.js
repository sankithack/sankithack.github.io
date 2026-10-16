// 52-card deck and default card images.
// Default scheme: the image starts with the suit's letter (Spades S, Hearts H,
// Diamonds D, Clubs C/K) and its next consonant gives the rank via the Major System
// (A=1 … 9=9, 10=s). Jacks, queens and kings are characters.
import { db } from '../storage.js';
import { DEFAULT_PAO } from './pao.js';

export const SUITS = [
  { id: 'S', name: 'Spades', sym: '♠', red: false },
  { id: 'H', name: 'Hearts', sym: '♥', red: true },
  { id: 'D', name: 'Diamonds', sym: '♦', red: true },
  { id: 'C', name: 'Clubs', sym: '♣', red: false },
];
export const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];

// Card codes like "AS", "10H", "QC".
export const DECK = SUITS.flatMap((s) => RANKS.map((r) => r + s.id));

export const DEFAULT_CARD_IMAGES = {
  AS: 'saddle', '2S': 'snake', '3S': 'smoke', '4S': 'sword', '5S': 'slide', '6S': 'sash', '7S': 'skate', '8S': 'safe', '9S': 'spoon', '10S': 'seesaw',
  JS: 'gravedigger', QS: 'witch', KS: 'black knight',
  AH: 'hat', '2H': 'honey', '3H': 'hammer', '4H': 'harp', '5H': 'helmet', '6H': 'hedgehog', '7H': 'hook', '8H': 'hoof', '9H': 'hippo', '10H': 'hose',
  JH: 'Cupid', QH: 'bride', KH: 'Romeo',
  AD: 'date', '2D': 'donut', '3D': 'dumbbell', '4D': 'door', '5D': 'dolphin', '6D': 'dodgeball', '7D': 'dog', '8D': 'devil', '9D': 'diaper', '10D': 'dice',
  JD: 'jeweler', QD: 'princess', KD: 'tycoon',
  AC: 'kite', '2C': 'canoe', '3C': 'camel', '4C': 'crown', '5C': 'clock', '6C': 'cushion', '7C': 'cookie', '8C': 'coffee', '9C': 'cupcake', '10C': 'kiss',
  JC: 'golfer', QC: 'gardener', KC: 'caveman',
};

export function cardInfo(code) {
  const suitId = code.slice(-1);
  const rank = code.slice(0, -1);
  const suit = SUITS.find((s) => s.id === suitId);
  return { code, rank, suit, name: `${rankName(rank)} of ${suit.name}` };
}

function rankName(r) {
  return { A: 'Ace', J: 'Jack', Q: 'Queen', K: 'King' }[r] || r;
}

export const cardImage = (code) => db().systems.cards[code] || DEFAULT_CARD_IMAGES[code];

export function defaultCardPao(code) {
  const def = DEFAULT_PAO[(DECK.indexOf(code) * 7 + 3) % 100]; // spread across the PAO list for variety
  return { p: def.p, a: def.a, o: cardImage(code) };
}

export function cardPaoFor(code) {
  const def = defaultCardPao(code);
  const custom = db().systems.cardPao[code] || {};
  return { p: custom.p || def.p, a: custom.a || def.a, o: custom.o || def.o };
}

/** HTML for a playing card. size: lg | md | sm | xs ('' = default). */
export function cardHTML(code, { size = '', tag = 'div', attrs = '' } = {}) {
  const { rank, suit } = cardInfo(code);
  return `<${tag} class="pcard ${size} ${suit.red ? 'red' : ''}" ${attrs} aria-label="${rankName(rank)} of ${suit.name}">
    <span class="corner">${rank}<br>${suit.sym}</span>
    <span class="pip" aria-hidden="true">${suit.sym}</span>
    <span class="corner bottom">${rank}<br>${suit.sym}</span>
  </${tag}>`;
}
