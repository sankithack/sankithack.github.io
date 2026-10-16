// Import a single game from Lichess (public export API, no token needed, CORS-enabled).
/** Game id from a Lichess URL ("lichess.org/abcd1234", ".../abcd1234WXYZ", ".../abcd1234/black#32") or a bare id. */
export function lichessGameId(text) {
  const t = text.trim();
  const m = t.match(/lichess\.org\/(?:embed\/(?:game\/)?)?([A-Za-z0-9]{8})(?:[A-Za-z0-9]{4})?(?:[/?#]|$)/);
  if (m) return m[1];
  return /^[A-Za-z0-9]{8}$/.test(t) ? t : null;
}

/** Fetch the PGN; throws an Error with a readable message. */
export async function fetchLichessPgn(id) {
  let res;
  try {
    res = await fetch(`https://lichess.org/game/export/${id}?clocks=false&evals=false&opening=true`, { headers: { Accept: 'application/x-chess-pgn' } });
  } catch {
    throw new Error('Could not reach Lichess — check your connection, or paste the PGN instead.');
  }
  if (res.status === 404) throw new Error(`Lichess has no game with id "${id}".`);
  if (res.status === 429) throw new Error('Lichess is rate-limiting requests — wait a minute and try again.');
  if (!res.ok) throw new Error(`Lichess answered with an error (${res.status}).`);
  const pgn = await res.text();
  const variant = pgn.match(/\[Variant "([^"]+)"\]/)?.[1];
  if (variant && !/^(standard|from position)$/i.test(variant)) throw new Error(`That game is ${variant} — only standard chess can be reviewed here.`);
  return pgn;
}
