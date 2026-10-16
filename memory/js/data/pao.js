// Starter PAO (Person–Action–Object) list for 00–99.
// Persons are generic characters so the list works for anyone; replace them with
// people YOU know or admire, because personal connections stick far better.
// The object defaults to the Major image for the same number.
import { db } from '../storage.js';
import { DEFAULT_MAJOR } from './major.js';

const PERSONS = [
  'Santa', 'Sailor', 'Samurai', 'Surfer', 'Scientist', 'Soldier', 'Sumo wrestler', 'Skater', 'Singer', 'Spy',
  'Teacher', 'Tarzan', 'Toddler', 'Tailor', 'Dentist', 'Detective', 'Drummer', 'Diver', 'Dracula', 'Tightrope walker',
  'Ninja', 'Nurse', 'Nun', 'Knight', 'News anchor', 'Nanny', 'Gnome', 'Napoleon', 'Neptune', 'Nerd',
  'Mermaid', 'Mime', 'Monk', 'Mummy', 'Magician', 'Mechanic', 'Mountaineer', 'Mail carrier', 'Medusa', 'Miner',
  'Robot', 'Ranger', 'Rapper', 'Referee', 'Robin Hood', 'Rock star', 'Rancher', 'Racing driver', 'Rodeo clown', 'Royal guard',
  'Lumberjack', 'Librarian', 'Lifeguard', 'Leprechaun', 'Lion tamer', 'Lawyer', 'Locksmith', 'Lord', 'Llama farmer', 'Lab technician',
  'Chef', 'Judge', 'Juggler', 'Jockey', 'Genie', 'Jester', 'Chimney sweep', 'Cheerleader', 'Chess master', 'Shepherd',
  'Cowboy', 'Clown', 'King', 'Queen', 'Caveman', 'Captain', 'Coach', 'Cook', 'Comedian', 'Gardener',
  'Firefighter', 'Farmer', 'Fairy', 'Pharaoh', 'Fisherman', 'Vampire', 'Viking', 'Fencer', 'Fortune teller', 'Flamenco dancer',
  'Pilot', 'Baker', 'Banker', 'Boxer', 'Ballerina', 'Barber', 'Bride', 'Pirate', 'Painter', 'Professor',
];

const ACTIONS = [
  'stirring', 'ironing', 'sunbathing on', 'wrestling', 'flushing', 'balancing', 'rolling up', 'darning', 'lounging on', 'scrubbing with',
  'tickling', 'surfing on', 'fishing for', 'polishing', 'changing', 'cradling', 'washing', 'feeding', 'releasing', 'tipping over',
  'sniffing', 'casting', 'praying to', 'sculpting', 'interviewing', 'hammering', 'filing', 'kicking', 'slicing', 'turning',
  'chasing', 'wiping', 'howling at', 'wrapping', 'pushing', 'riding', 'striking', 'sipping from', 'filming', 'unfolding',
  'smelling', 'trapping', 'dancing in', 'headbutting', 'paddling', 'baking', 'stomping on', 'climbing', 'patching', 'tying up',
  'lacing up', 'switching on', 'taming', 'squeezing', 'driving', 'painting', 'pulling off', 'chopping', 'erupting', 'kissing',
  'grating', 'folding', 'swinging', 'spreading', 'sitting on', 'locking in', 'sentencing', 'hatching', 'tasting', 'steering',
  'plucking', 'petting', 'flipping', 'combing', 'crashing', 'shoveling', 'crowning', 'decorating', 'exploring', 'trimming',
  'smashing', 'massaging', 'waving', 'blowing', 'spraying', 'shredding', 'netting', 'getting lost in', 'playing', 'twirling',
  'flying', 'batting', 'burying', 'defusing', 'hugging', 'ringing', 'sweeping', 'reading', 'grilling', 'smoking',
];

export const DEFAULT_PAO = PERSONS.map((p, i) => ({ p, a: ACTIONS[i], o: DEFAULT_MAJOR[i] }));

export function paoFor(nn) {
  const def = DEFAULT_PAO[Number(nn)];
  const custom = db().systems.pao[nn] || {};
  return { p: custom.p || def.p, a: custom.a || def.a, o: custom.o || db().systems.major[nn] || def.o };
}
