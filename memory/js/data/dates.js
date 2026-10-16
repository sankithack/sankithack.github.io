// Dates event content: real historic events and a generator for fictional ones
// (fictional is the championship format: you can't rely on prior knowledge).
import { pick, randRange, shuffle } from '../utils.js';

export const HISTORIC = [
  [1066, 'Battle of Hastings'],
  [1088, 'University of Bologna founded'],
  [1163, 'Construction of Notre-Dame de Paris begins'],
  [1206, 'Genghis Khan proclaimed ruler of the Mongols'],
  [1215, 'Magna Carta sealed'],
  [1271, 'Marco Polo sets out for China'],
  [1347, 'The Black Death reaches Europe'],
  [1440, 'Gutenberg develops his printing press'],
  [1453, 'Fall of Constantinople'],
  [1492, 'Columbus reaches the Americas'],
  [1498, 'Vasco da Gama reaches India by sea'],
  [1503, 'Leonardo da Vinci begins the Mona Lisa'],
  [1517, 'Luther posts his 95 Theses'],
  [1522, 'Magellan’s expedition completes the first circumnavigation'],
  [1543, 'Copernicus publishes his Sun-centred model'],
  [1564, 'William Shakespeare is born'],
  [1588, 'The Spanish Armada is defeated'],
  [1609, 'Galileo builds his first telescope'],
  [1620, 'The Mayflower reaches Plymouth'],
  [1666, 'Great Fire of London'],
  [1687, 'Newton publishes the Principia'],
  [1752, 'Franklin’s kite experiment'],
  [1769, 'James Watt patents his steam engine improvement'],
  [1776, 'US Declaration of Independence'],
  [1789, 'Storming of the Bastille'],
  [1804, 'Napoleon crowned Emperor'],
  [1815, 'Battle of Waterloo'],
  [1825, 'First public steam railway opens (Stockton–Darlington)'],
  [1840, 'The Penny Black stamp is issued'],
  [1848, 'California Gold Rush begins'],
  [1859, 'Darwin publishes On the Origin of Species'],
  [1869, 'Suez Canal opens'],
  [1876, 'Bell patents the telephone'],
  [1879, 'Edison demonstrates his light bulb'],
  [1885, 'Karl Benz builds his Motorwagen'],
  [1889, 'The Eiffel Tower opens'],
  [1895, 'Röntgen discovers X-rays'],
  [1896, 'First modern Olympic Games in Athens'],
  [1903, 'Wright brothers’ first powered flight'],
  [1905, 'Einstein publishes special relativity'],
  [1912, 'The Titanic sinks'],
  [1914, 'World War I begins'],
  [1922, 'Tutankhamun’s tomb is discovered'],
  [1927, 'Lindbergh flies solo across the Atlantic'],
  [1928, 'Fleming discovers penicillin'],
  [1945, 'World War II ends'],
  [1947, 'The transistor is invented'],
  [1953, 'First ascent of Mount Everest'],
  [1955, 'Rosa Parks refuses to give up her bus seat'],
  [1957, 'Sputnik 1 is launched'],
  [1961, 'Yuri Gagarin becomes the first human in space'],
  [1963, 'Martin Luther King Jr.’s “I Have a Dream” speech'],
  [1969, 'First Moon landing'],
  [1981, 'First Space Shuttle launch'],
  [1989, 'The Berlin Wall falls'],
  [1990, 'Hubble Space Telescope launched'],
  [1991, 'The World Wide Web opens to the public'],
  [1997, 'Dolly the cloned sheep is announced'],
  [2001, 'Wikipedia is launched'],
  [2007, 'The first iPhone is introduced'],
].map(([year, event]) => ({ year: String(year), event }));

const SUBJECTS = [
  'A talking penguin', 'The village baker', 'A giant tortoise', 'A robot butler', 'The royal cat', 'A band of pirates',
  'A tiny dragon', 'The town mayor', 'A flock of parrots', 'A space tourist', 'A retired wizard', 'A nervous astronaut',
  'A singing cactus', 'A moon miner', 'A jazz-playing octopus', 'The last unicorn', 'A chess-playing horse', 'A time traveler',
  'An ice-cream vendor', 'A sleepy volcano', 'An underwater gardener', 'A famous clown', 'The queen’s chef', 'A shy giant',
  'A team of beavers', 'A desert nomad', 'A lighthouse keeper', 'A mischievous ghost', 'A mountain goat', 'A circus elephant',
];

const PREDICATES = [
  'wins the lottery', 'invents the umbrella', 'discovers a hidden island', 'opens a sock museum', 'crosses the ocean on a raft',
  'is elected king', 'paints the moon green', 'builds a glass bridge', 'bans Mondays', 'finds a golden egg', 'learns to fly',
  'starts a rock band', 'plants a forest overnight', 'sails to the North Pole', 'writes a bestselling cookbook', 'tames a thunderstorm',
  'bakes the world’s largest pie', 'digs a tunnel to the sea', 'loses the crown jewels', 'teaches cats to read', 'climbs the tallest tower',
  'founds a school for spies', 'invents chocolate rain', 'wins a dance contest', 'swallows a compass', 'builds a flying ship',
  'discovers a new color', 'marries a prince', 'outruns a cheetah', 'opens the first zoo on the Moon',
];

/** n unique events. kind: 'fictional' | 'historic' | 'mixed' */
export function makeDates(n, kind = 'fictional') {
  const out = [];
  const seenEvents = new Set();
  const seenYears = new Set();
  const historic = shuffle(HISTORIC);
  let guard = 0;
  while (out.length < n && guard++ < 5000) {
    const useHistoric = kind === 'historic' || (kind === 'mixed' && Math.random() < 0.5);
    let item;
    if (useHistoric && historic.length) item = historic.pop();
    else item = { year: String(randRange(1000, 2099)), event: `${pick(SUBJECTS)} ${pick(PREDICATES)}` };
    if (seenEvents.has(item.event) || seenYears.has(item.year)) continue;
    seenEvents.add(item.event);
    seenYears.add(item.year);
    out.push(item);
  }
  return out;
}
