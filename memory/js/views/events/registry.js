// All practice events, in menu order.
import numbers from './numbers.js';
import cards from './cards.js';
import words from './words.js';
import names from './names.js';
import phone from './phone.js';
import binary from './binary.js';
import dates from './dates.js';
import spoken from './spoken.js';

export const EVENTS = [numbers, cards, words, names, phone, binary, dates, spoken];

export const eventById = (id) => EVENTS.find((e) => e.id === id);
