// Default Major System images for 00–99. Every word encodes its number by consonant sound.
// Users override any entry; overrides live in db().systems.major.
import { db } from '../storage.js';
import { pad2 } from '../utils.js';

export const DEFAULT_MAJOR = [
  'sauce', 'suit', 'sun', 'sumo', 'sewer', 'seal', 'sushi', 'sock', 'sofa', 'soap',
  'toes', 'tide', 'tuna', 'dome', 'tire', 'doll', 'dish', 'duck', 'dove', 'tub',
  'nose', 'net', 'nun', 'gnome', 'Nero', 'nail', 'notch', 'neck', 'knife', 'knob',
  'mouse', 'mat', 'moon', 'mummy', 'mower', 'mule', 'match', 'mug', 'movie', 'map',
  'rose', 'rat', 'rain', 'ram', 'rower', 'roll', 'roach', 'rock', 'roof', 'rope',
  'lace', 'light', 'lion', 'lime', 'lorry', 'lily', 'leech', 'log', 'lava', 'lip',
  'cheese', 'sheet', 'chain', 'jam', 'chair', 'jail', 'judge', 'chick', 'chef', 'ship',
  'goose', 'cat', 'coin', 'comb', 'car', 'coal', 'cage', 'cake', 'cave', 'cap',
  'vase', 'foot', 'fan', 'foam', 'fire', 'file', 'fish', 'fog', 'fife', 'fob',
  'bus', 'bat', 'bone', 'bomb', 'bear', 'bell', 'beach', 'book', 'beef', 'pipe',
];

export const MAJOR_RULES = [
  ['0', 's, z, soft c', 'z is the first sound of "zero"'],
  ['1', 't, d, th', 't has one downstroke'],
  ['2', 'n', 'n has two downstrokes'],
  ['3', 'm', 'm has three downstrokes'],
  ['4', 'r', 'r is the last sound of "four"'],
  ['5', 'l', 'L is the Roman numeral 50; hold up 5 fingers: thumb + index make an L'],
  ['6', 'j, sh, ch, soft g', 'a J flipped looks like a 6'],
  ['7', 'k, hard c, hard g, q', 'K is made of two 7s'],
  ['8', 'f, v, ph', 'a handwritten f has two loops like 8'],
  ['9', 'p, b', 'p is a mirrored 9'],
];

export const NUMBERS = Array.from({ length: 100 }, (_, i) => pad2(i));

export const majorImage = (nn) => db().systems.major[nn] || DEFAULT_MAJOR[Number(nn)];
