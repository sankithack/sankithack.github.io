// Fetches how often each opening is played by 2000+ rated players on Lichess and writes data/popularity.json.
// The Lichess opening explorer needs a (free) personal API token: https://lichess.org/account/oauth/token
//   LICHESS_TOKEN=lip_xxx node scripts/fetch-popularity.mjs
// Each opening's share = games reaching its defining position / all games in the sample.
import { readFileSync, writeFileSync } from 'node:fs';
import { Chess } from '../js/vendor/chess.js';

const root = new URL('..', import.meta.url).pathname;
const token = process.env.LICHESS_TOKEN;
if (!token) { console.error('Set LICHESS_TOKEN (create one at https://lichess.org/account/oauth/token — no scopes needed).'); process.exit(1); }
const RATINGS = '2000,2200,2500', SPEEDS = 'blitz,rapid,classical';
const openings = JSON.parse(readFileSync(root + 'data/openings.json', 'utf8'));

async function explore(uciMoves) {
  const url = `https://explorer.lichess.ovh/lichess?variant=standard&speeds=${SPEEDS}&ratings=${RATINGS}&moves=50&topGames=0&recentGames=0&play=${uciMoves.join(',')}`;
  for (let attempt = 0; attempt < 5; attempt++) {
    const r = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (r.status === 429) { await new Promise((s) => setTimeout(s, 60000)); continue; }
    if (!r.ok) throw new Error(`${r.status} for ${url}`);
    return r.json();
  }
  throw new Error('rate limited');
}
const games = (m) => m.white + m.draws + m.black;

const start = await explore([]);
const total = games(start);
const out = { source: 'Lichess opening explorer', ratings: RATINGS, speeds: SPEEDS, fetched: new Date().toISOString().slice(0, 10), totalGames: total, openings: {} };
for (const o of openings) {
  const c = new Chess();
  const uci = o.mainLine.slice(0, o.defining).map((m) => { const mv = c.move(typeof m === 'string' ? m : m.san); return mv.from + mv.to + (mv.promotion || ''); });
  const parent = await explore(uci.slice(0, -1));
  const move = parent.moves.find((m) => m.uci === uci.at(-1));
  const n = move ? games(move) : 0;
  out.openings[o.id] = { games: n, share: +(n / total * 100).toFixed(2) };
  console.log(o.name.padEnd(26), String(n).padStart(10), out.openings[o.id].share + '%');
  await new Promise((s) => setTimeout(s, 1200)); // be polite
}
writeFileSync(root + 'data/popularity.json', JSON.stringify(out, null, 2));
console.log('wrote data/popularity.json');
