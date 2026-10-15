// Runs the game review off the main thread so long games don't freeze the page.
import { reviewGame } from './review.js';
self.onmessage = ({ data }) => {
  try { self.postMessage({ ok: true, review: reviewGame(data.startFen, data.sans) }); }
  catch (e) { self.postMessage({ ok: false, error: e.message }); }
};
