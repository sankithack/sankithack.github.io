// Beginner curriculum: 4 weeks, then a rotating maintenance plan.
// Each day = the week's core tasks + that day's extras.
//
// Task types:
//   lesson  {id}           done once the lesson is marked complete
//   build   {loci}         done when any palace has at least that many loci
//   palace                 done when a palace was practised today
//   srs     {deck}         done when nothing is due/new for that deck today
//   event   {id, times}    done after `times` sessions of that event today

export const WEEKS = [
  {
    title: 'Foundations: palaces & images',
    goal: 'Build your first memory palace and learn to make images that stick. Short sessions, every day.',
    core: [{ type: 'palace' }, { type: 'event', id: 'words' }],
    days: [
      [{ type: 'lesson', id: 'palace' }, { type: 'build', loci: 10 }],
      [{ type: 'lesson', id: 'images' }],
      [],
      [{ type: 'build', loci: 20 }],
      [{ type: 'event', id: 'dates' }],
      [{ type: 'event', id: 'words', times: 2 }],
      [{ type: 'lesson', id: 'major' }],
    ],
  },
  {
    title: 'Numbers: the Major System',
    goal: 'Learn 10 new number images a day with the flashcards and start Speed Numbers. Keep your palace sharp.',
    core: [{ type: 'srs', deck: 'numbers' }, { type: 'event', id: 'numbers' }],
    days: [
      [{ type: 'lesson', id: 'major' }],
      [{ type: 'event', id: 'words' }],
      [{ type: 'palace' }],
      [{ type: 'build', loci: 30 }],
      [{ type: 'event', id: 'spoken' }],
      [{ type: 'event', id: 'dates' }],
      [{ type: 'event', id: 'words' }, { type: 'event', id: 'numbers', times: 2 }],
    ],
  },
  {
    title: 'Cards and faces',
    goal: 'Learn your card images, start Speed Cards with a handful of cards, and meet Names & Faces.',
    core: [{ type: 'srs', deck: 'numbers' }, { type: 'srs', deck: 'cards' }, { type: 'event', id: 'cards' }],
    days: [
      [{ type: 'lesson', id: 'cards' }],
      [{ type: 'lesson', id: 'names' }, { type: 'event', id: 'names' }],
      [{ type: 'event', id: 'numbers' }],
      [{ type: 'event', id: 'names' }],
      [{ type: 'event', id: 'phone' }],
      [{ type: 'event', id: 'numbers' }, { type: 'build', loci: 40 }],
      [{ type: 'event', id: 'names' }, { type: 'event', id: 'words' }],
    ],
  },
  {
    title: 'PAO and mixed training',
    goal: 'Meet PAO, try every event, and finish with a mini competition on day 7.',
    core: [{ type: 'srs', deck: 'numbers' }, { type: 'srs', deck: 'cards' }],
    days: [
      [{ type: 'lesson', id: 'pao' }, { type: 'event', id: 'numbers' }],
      [{ type: 'event', id: 'cards' }, { type: 'event', id: 'binary' }],
      [{ type: 'event', id: 'numbers' }, { type: 'event', id: 'names' }],
      [{ type: 'event', id: 'cards' }, { type: 'event', id: 'dates' }],
      [{ type: 'event', id: 'numbers' }, { type: 'event', id: 'spoken' }],
      [{ type: 'event', id: 'cards' }, { type: 'event', id: 'phone' }, { type: 'event', id: 'words' }],
      [{ type: 'event', id: 'numbers' }, { type: 'event', id: 'cards' }, { type: 'event', id: 'names' }, { type: 'event', id: 'words' }],
    ],
  },
];

export const MAINTENANCE = {
  title: 'Ongoing training',
  goal: 'You’ve finished the beginner plan. Keep reviewing your images daily and rotate events. Push your levels up one at a time.',
  core: [{ type: 'srs', deck: 'numbers' }, { type: 'srs', deck: 'cards' }],
  days: [
    [{ type: 'event', id: 'numbers' }, { type: 'event', id: 'cards' }],
    [{ type: 'event', id: 'names' }, { type: 'event', id: 'words' }],
    [{ type: 'event', id: 'binary' }, { type: 'event', id: 'spoken' }],
    [{ type: 'event', id: 'cards' }, { type: 'event', id: 'phone' }],
    [{ type: 'event', id: 'numbers' }, { type: 'event', id: 'dates' }],
    [{ type: 'event', id: 'cards' }, { type: 'event', id: 'names' }, { type: 'palace' }],
    [{ type: 'event', id: 'numbers' }, { type: 'event', id: 'cards' }, { type: 'event', id: 'words' }],
  ],
};

export const PLAN_DAYS = WEEKS.length * 7;

/** dayIndex: 0-based days since the plan started. */
export function planForDay(dayIndex) {
  const week = dayIndex < PLAN_DAYS ? WEEKS[Math.floor(dayIndex / 7)] : MAINTENANCE;
  const tasks = [...week.core, ...week.days[dayIndex % 7]];
  // Merge duplicates (e.g. core "words" + extra "words x2").
  const merged = [];
  for (const t of tasks) {
    const same = merged.find((m) => m.type === t.type && m.id === t.id && m.deck === t.deck && t.type !== 'build');
    if (same) same.times = Math.max(same.times || 1, t.times || 1);
    else merged.push({ ...t });
  }
  return { week, weekIndex: Math.floor(dayIndex / 7), tasks: merged };
}
