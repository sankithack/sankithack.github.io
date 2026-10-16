# Chess Strategy Academy

Live: https://sankithack.github.io/chess/

An interactive chess course that explains **why** moves are played, with practice for everything:

- **Openings**: 21 openings (Italian, Ruy López, Sicilian, French, Caro-Kann, Queen's Gambit, Slav, Nimzo-Indian, Queen's Indian, King's Indian, Grünfeld, Catalan, London, English, Réti, Scotch, Petrov, Vienna, Scandinavian, Pirc, Dutch). Annotated main lines, levelled variations, traps, "how to beat it" lines, advanced notes and sourced 2000+ statistics.
- **Tactics**: 25 motifs and mating patterns with extra puzzle positions; solve on the board by drag, tap or typing.
- **Strategy**: 20 concepts with example positions and find-the-square exercises.
- **Endgames**: 16 lessons (incl. the Réti manoeuvre, rook-pawn and wrong-bishop draws); play them against the computer (a king-and-pawn solver runs in a Web Worker and defends perfectly).
- **Practice**: opening drills for every line, puzzle rush, candidate moves, 3+ move calculation, attack drills, position memory, follow-the-moves, square colours, quiz and flashcards.
- **Review a game**: paste a Lichess game link (fetched via the public export API) or a PGN; a quick (non-engine) scan flags mates in one/two, loose pieces and sound sacrifices.
- **Guides**: a 500 → 2000+ roadmap with self-ticking checklists, how to think, memory techniques and animated attacking lessons. Progress is saved in `localStorage`.

Plain HTML, CSS and ES modules. No build step, so GitHub Pages serves this folder as-is.

## Run locally

```sh
cd chess
npm start              # zero-dependency static server on http://localhost:5173
# or: python3 -m http.server 5173
```

Opening `index.html` straight from disk won't work (browsers block `fetch` and modules on `file://`).

## Offline and install

The site is a small installable web app: `manifest.webmanifest`, icons in `icons/`, and `sw.js` (scoped to this folder; network first, cache fallback). The list of files to cache lives in `offline-files.json`. **Before every commit, run:**

```sh
npm run precommit     # regenerates offline-files.json, then validates all data
```

Stage `offline-files.json` if it says it changed. `npm run validate` on its own fails when the list is out of date.

## Validate the data

```sh
npm run validate
```

This replays every move sequence with chess.js and fails on:
- illegal moves, bad square names or bad arrow names
- lines that claim mate but don't end in checkmate
- endgame lines with an `expect` claim the built-in king-and-pawn solver (`scripts/kp-solver.mjs`) disagrees with, including any move in the demo line that throws away the result

Run it after every content edit.

## Add an opening

Append an object to `data/openings.json` (copy an existing one as a template):

```jsonc
{
  "id": "vienna",                       // URL slug: #/openings/vienna
  "name": "Vienna Game", "eco": "C25–C29",
  "side": "white",                      // white | black
  "styles": ["aggressive"],             // aggressive | solid | positional
  "difficulty": "intermediate",         // beginner | intermediate | advanced
  "mnemonic": "One-line memory hook.",
  "summary": "Card text.", "purpose": "What the opening aims for.",
  "mainLine": [
    { "san": "e4", "note": "Why this move.", "arrows": ["f1c4", "!d8h4", "~g1f3"], "squares": ["d5"] },
    "e5", "Nc3"                         // bare SAN strings are fine too
  ],
  "ideas": { "white": ["…"], "black": ["…"] },
  "plans": ["…"], "mistakes": ["…"],
  "traps":      [{ "name": "…", "side": "white", "moves": ["e4", "…"], "explanation": "…" }],
  "variations": [{ "name": "…", "level": "advanced", "moves": ["e4", "…"], "idea": "…" }],
  "counters":   [{ "name": "…", "moves": ["e4", "…"], "why": "…" }],
  "advanced":   [{ "title": "…", "text": "…", "moves": ["optional line"] }]
}
```

Arrow strings: `"g1f3"` is a plan (green), `"!d8h4"` a threat (red), `"~e2e4"` an alternative (blue). `squares` highlights key squares. All move lists start from the initial position.

Tactics (`data/tactics.json`) use `fen` (or `setup` moves from the start) plus a `solution` that alternates your move and the reply, ending on your move. Endgames (`data/endgames.json`) hold one or more `lines`, each with a `fen` and `moves`, plus an optional `"expect": "win" | "draw" | "loss"` for king-and-pawn positions.

## Layout

```
chess/
  index.html            entry point (hash routes: #/openings/italian, #/tactics/pin, …)
  css/styles.css        design tokens (light + dark), board, layouts
  data/*.json           all course content
  js/app.js             shell, navigation, theme, router with view transitions
  js/lib/               board (animated pieces + SVG arrows), viewer, line building, progress store
  js/pages/             one module per section
  js/vendor/            chess.js 1.4.0 (BSD-2), Cburnett piece SVGs (CC BY-SA 3.0)
  scripts/              validate-data.mjs, kp-solver.mjs, serve.mjs
```

## Credits

- [chess.js](https://github.com/jhlywa/chess.js) for move generation and validation (BSD-2-Clause).
- Piece set by Colin M.L. Burnett, [Wikimedia Commons](https://commons.wikimedia.org/wiki/Category:SVG_chess_pieces), CC BY-SA 3.0.
