// Animated step-by-step example player.
//
// A demo is { title, stage: () => html, steps: [{ caption, apply(stage), ms? }] }.
// Steps are cumulative: step i = initial stage + apply(0..i). Moving forward one step
// animates; jumping (back, restart, dots) rebuilds the stage with animations disabled.
import { esc } from '../utils.js';

const reduceMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

export function demoPlayer(el, demo, { autoplay = true } = {}) {
  el.innerHTML = `
    <figure class="demo" aria-label="Animated example: ${esc(demo.title)}">
      <div class="demo-head"><span class="badge accent">▶ Example</span><b>${esc(demo.title)}</b></div>
      <div class="demo-stage"></div>
      <figcaption class="demo-caption" aria-live="polite"></figcaption>
      <div class="demo-controls">
        <button class="btn small ghost" data-act="restart" aria-label="Restart">↺</button>
        <button class="btn small ghost" data-act="back" aria-label="Previous step">◀</button>
        <button class="btn small primary" data-act="play" aria-label="Play">▶ Play</button>
        <button class="btn small ghost" data-act="next" aria-label="Next step">▶</button>
        <span class="demo-dots">${demo.steps.map((_, i) => `<button data-i="${i}" aria-label="Step ${i + 1}"></button>`).join('')}</span>
      </div>
    </figure>`;

  const stage = el.querySelector('.demo-stage');
  const caption = el.querySelector('.demo-caption');
  const playBtn = el.querySelector('[data-act="play"]');
  let current = -1;
  let timer = null;
  let playing = false;

  function rebuild(upTo) {
    stage.classList.add('instant');
    stage.innerHTML = demo.stage();
    for (let k = 0; k <= upTo; k++) demo.steps[k].apply(stage);
    void stage.offsetWidth; // flush styles before re-enabling transitions
    stage.classList.remove('instant');
  }

  function show(i, animate) {
    i = Math.max(-1, Math.min(demo.steps.length - 1, i));
    if (animate && i === current + 1) demo.steps[i].apply(stage);
    else rebuild(i);
    current = i;
    caption.innerHTML = i >= 0 ? demo.steps[i].caption : (demo.intro || 'Press play to watch the technique step by step.');
    el.querySelectorAll('.demo-dots button').forEach((b, k) => b.classList.toggle('on', k <= i));
    if (i === demo.steps.length - 1) stop(true);
  }

  function tick() {
    if (!el.isConnected) return stop();
    if (current >= demo.steps.length - 1) return stop(true);
    show(current + 1, true);
    const ms = demo.steps[current]?.ms || demo.interval || 2600;
    timer = setTimeout(tick, ms);
  }

  function play() {
    if (current >= demo.steps.length - 1) { stage.innerHTML = demo.stage(); current = -1; }
    playing = true;
    playBtn.innerHTML = '⏸ Pause';
    playBtn.setAttribute('aria-label', 'Pause');
    clearTimeout(timer);
    timer = setTimeout(tick, current < 0 ? 300 : 0);
  }

  function stop(ended = false) {
    playing = false;
    clearTimeout(timer);
    playBtn.innerHTML = ended ? '↻ Replay' : '▶ Play';
    playBtn.setAttribute('aria-label', ended ? 'Replay' : 'Play');
  }

  el.querySelector('.demo-controls').addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.i != null) { stop(); show(Number(b.dataset.i), false); return; }
    const act = b.dataset.act;
    if (act === 'play') return playing ? stop() : play();
    stop();
    if (act === 'restart') { stage.innerHTML = demo.stage(); current = -1; show(-1, false); }
    if (act === 'back') show(current - 1, false);
    if (act === 'next') show(current + 1, true);
  });

  stage.innerHTML = demo.stage();
  show(-1, false);

  // Autoplay once when scrolled into view (unless the user prefers reduced motion).
  if (autoplay && !reduceMotion() && 'IntersectionObserver' in window) {
    const io = new IntersectionObserver((entries) => {
      if (entries.some((x) => x.isIntersecting)) {
        io.disconnect();
        if (current < 0 && !playing) play();
      }
    }, { threshold: 0.5 });
    io.observe(stage);
  }

  return { play, stop };
}

/* ---------- Stage helpers used by demos ---------- */
export const $in = (stage, sel) => stage.querySelectorAll(sel).forEach((e) => e.classList.add('in'));
export const $out = (stage, sel) => stage.querySelectorAll(sel).forEach((e) => e.classList.remove('in'));
export const $cls = (stage, sel, cls, on = true) => stage.querySelectorAll(sel).forEach((e) => e.classList.toggle(cls, on));
/** Re-trigger a one-shot CSS animation class. */
export function $anim(stage, sel, cls) {
  stage.querySelectorAll(sel).forEach((e) => {
    e.classList.remove(cls);
    void e.offsetWidth;
    e.classList.add(cls);
  });
}
