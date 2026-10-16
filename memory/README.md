# Loci: Memory Training

Live: https://sankithack.github.io/memory/

A free, offline-capable website for learning memory techniques and training for memory championships (USA Memory Championship style events). It is plain HTML, CSS and JavaScript with no build step, made to be hosted on **GitHub Pages**.

- **Learn:** six beginner lessons (memory palace, vivid images, Major System, PAO, card system, names & faces), each with a mini-exercise.
- **Memory Palace Builder:** create palaces, list loci in walking order, and practise with walk-through, random-quiz and full-recall modes.
- **Image trainers:** spaced-repetition flashcards for your 00–99 number images and 52 card images, plus a timed speed drill.
- **Eight timed events:** Speed Numbers, Speed Cards, Random Words, Names & Faces, Phone Numbers, Binary Digits, Historic/Fictional Dates and Spoken Numbers. Each has levels, memorize and recall timers, automatic scoring and a side-by-side comparison of correct vs. your answers.
- **4-week beginner plan:** a daily checklist on the dashboard, plus streaks, personal bests and recent scores.
- **Progress charts:** score, accuracy, time and memorization rate over time for every event.
- **Your data stays yours:** everything is saved in your browser (`localStorage`), with JSON export and import in Settings.

---

## Hosting

This folder is served by GitHub Pages from the `sankithack.github.io` repository, so pushing to `main` publishes it at `/memory/`. All paths are relative, so the folder can be moved or renamed.

The service worker serves the cached copy first and fetches updates in the background, so **reload once more** after a deploy to see changes. If you add, rename or remove files, also update the `FILES` list and bump `VERSION` in `sw.js` (e.g. `loci-v1` → `loci-v2`). It only ever deletes its own `loci-*` caches, so other apps on the domain are unaffected.

### Preview locally

ES modules don't load from `file://`, so serve the folder:

```bash
python3 -m http.server 8000   # from the repository root
# then open http://localhost:8000/memory/
```

---

## How to use it

### Your first week
1. Open the **Dashboard** and click **Start the 4-week plan**.
2. Read **Lesson 1: The Memory Palace** and do its exercise.
3. Go to **Palaces** and build your first palace with 10 loci in your home. Practise walking it.
4. Do the daily checklist. Each item links straight to the right page and ticks itself off when done.

### The 4-week plan

| Week | Focus | Daily core |
|------|-------|------------|
| 1 | Palaces & images | Palace walk + Random Words |
| 2 | Major System for numbers | Number flashcards + Speed Numbers |
| 3 | Cards and faces | Number & card flashcards + Speed Cards (+ Names & Faces) |
| 4 | PAO and mixed events, ending with a mini competition | Flashcards + rotating events |

After week 4 the dashboard switches to a rotating maintenance plan. You can restart the plan at any time from the dashboard.

### Levels and unlocking
Every event has levels, e.g. Speed Cards goes 5 → 10 → 15 → 20 → 26 → 39 → 52 cards. **Score 90% or better on 2 of your last 3 attempts** at your highest level to unlock the next one. You can still try any size with custom settings, but custom sessions don't count towards unlocking.

### Scoring
- **Standard (default):** every correct item scores one point.
- **Championship (strict)**, set in Settings: rows are scored like a real competition. A perfect row scores full points, a row with one mistake scores half, and two or more mistakes score zero. Only rows you attempted are counted. Spoken Numbers stops at your first mistake. Names and dates always score per correct answer.
- **Accuracy** (correct ÷ total) is shown either way, and it is what unlocks levels.

After every event you get a **side-by-side comparison**: green is correct, red is a mistake or a gap. When the same image fails repeatedly, replace it with a more vivid one.

### Customizing your images
**Learn → Your image systems** has editable lists:
- **Major 00–99:** a badge shows whether a word's spelling fits its number.
- **PAO 00–99:** person, action and object.
- **Card images** and **Card PAO.**

The starter lists are only a starting point. **Images you choose yourself, especially real people you know, stick far better.** Edits save as you leave each field and are used everywhere (trainers, hints, lessons).

### Flashcards (spaced repetition)
**Trainers** introduces a few new images per day (adjust in Settings) and schedules reviews with an SM-2 algorithm: grade each card *Again / Hard / Good / Easy* (keys 1–4, Space to reveal). Use **Speed drill** to time how fast images come to mind. Aim for under 1 second each.

### Back up your data
Data lives only in the browser you use. In **Settings** click **Export backup** to download a `.json` file; **Import backup** restores it, on the same or another device. Export regularly, and always before clearing browser data.

### Keyboard shortcuts
- Event memorize phase: `Space` / `→` next group or card, `←` back.
- Flashcards: `Space` reveal, `1`–`4` grade.
- Palace walk: `Space` reveal, `1` knew it, `0` missed.
- Speed drill: `Space` got it, `X` didn't come.

---

## Project structure

```
index.html              App shell (header, nav, <main>)
sw.js                   Service worker: offline cache
manifest.webmanifest    Installable app metadata
icon.svg                App icon
.nojekyll               Tells GitHub Pages to serve files as-is
css/base.css            Design tokens (light/dark), layout
css/components.css      Buttons, cards, events, charts…
js/app.js               Hash router (#/learn, #/events/cards…) and start-up
js/storage.js           localStorage state, export/import, streaks, levels
js/utils.js             Helpers (random, dates, timers, DOM)
js/lib/                 srs.js, avatar.js (generated faces), chart.js, speech.js, compare.js (scoring), major.js (decoder)
js/data/                Default image lists, names, words, dates, lessons, curriculum
js/views/               One module per page
js/views/events/        engine.js (shared event flow) + one module per event
```

All paths are relative, so the site works from any sub-path such as `username.github.io/repo-name/`.

### Adding a new event
Create `js/views/events/myevent.js` exporting `{ id, name, blurb, levels, fields, defaults, generate, memorize, recall, check }` (the interface is documented at the top of `engine.js`; `words.js` is a short example), add it to `registry.js`, and add the file to `FILES` in `sw.js`.

## Browser notes
- Works in current Chrome, Edge, Firefox and Safari, on desktop and mobile.
- **Spoken Numbers** uses the browser's built-in speech synthesis. If a browser has none, digits are flashed on screen instead. Pick a voice and speed in Settings.
- Faces in Names & Faces are generated cartoon illustrations; no photos of real people are used.
