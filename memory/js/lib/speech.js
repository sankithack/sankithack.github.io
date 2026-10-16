// Reads digits aloud at a steady pace with the Web Speech API.
const WORDS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine'];

export const speechSupported = () => 'speechSynthesis' in window && 'SpeechSynthesisUtterance' in window;

/**
 * Speak `digits` one by one, `rate` digits per second, on a fixed clock
 * (not on utterance end events, which some browsers never fire).
 * Returns a stop() function.
 */
export function speakDigits(digits, { rate = 1, voiceName = '', onDigit, onEnd } = {}) {
  const can = speechSupported();
  const voice = can && voiceName ? speechSynthesis.getVoices().find((v) => v.name === voiceName) : null;
  const interval = 1000 / rate;
  let i = 0;
  let stopped = false;
  let timer;

  const next = () => {
    if (stopped) return;
    if (i >= digits.length) {
      timer = setTimeout(() => !stopped && onEnd?.(), Math.max(800, interval));
      return;
    }
    const d = digits[i];
    if (can) {
      speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(WORDS[d] ?? d);
      u.rate = Math.min(2, Math.max(1, rate));
      u.lang = voice?.lang || 'en-US';
      if (voice) u.voice = voice;
      speechSynthesis.speak(u);
    }
    onDigit?.(i, d);
    i++;
    timer = setTimeout(next, interval);
  };
  timer = setTimeout(next, 500);

  return () => {
    stopped = true;
    clearTimeout(timer);
    if (can) speechSynthesis.cancel();
  };
}
