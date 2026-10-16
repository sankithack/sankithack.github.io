// Minimal single-series SVG line chart with a hover crosshair + tooltip.
// points: [{ y: number, tip: string }] in chronological order.
import { esc } from '../utils.js';

const W = 480;
const H = 200;
const PAD = { l: 44, r: 14, t: 14, b: 26 };

// Round step (1, 2, 5 × 10^k) giving about four gridlines.
function niceStep(v) {
  if (v <= 0) return 1;
  const p = 10 ** Math.floor(Math.log10(v));
  const n = v / p;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * p;
}

export function lineChart(container, { points, title, yMax, fmt = (v) => String(Math.round(v)), xLabel = (i) => String(i + 1) }) {
  const raw = Math.max(...points.map((p) => p.y), 0) * 1.05 || 1;
  const step = yMax ? yMax / 4 : niceStep(raw / 4);
  const max = yMax ?? Math.ceil(raw / step) * step;
  const iw = W - PAD.l - PAD.r;
  const ih = H - PAD.t - PAD.b;
  const x = (i) => PAD.l + (points.length === 1 ? iw / 2 : (i / (points.length - 1)) * iw);
  const y = (v) => PAD.t + ih - (Math.min(v, max) / max) * ih;
  const ticks = Array.from({ length: Math.round(max / step) + 1 }, (_, i) => i * step);

  if (!points.length) {
    container.innerHTML = `<div class="chart"><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(title)}: no data"><text class="empty" x="${W / 2}" y="${H / 2}" text-anchor="middle">No sessions yet</text></svg></div>`;
    return;
  }

  const line = points.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)} ${y(p.y).toFixed(1)}`).join(' ');
  const area = `${line} L${x(points.length - 1).toFixed(1)} ${PAD.t + ih} L${x(0).toFixed(1)} ${PAD.t + ih} Z`;
  const showDots = points.length <= 60;
  const xEvery = Math.max(1, Math.ceil(points.length / 8));

  container.innerHTML = `<div class="chart" style="position:relative">
    <svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(title)}, ${points.length} sessions">
      ${ticks.map((t) => `<line class="grid-line" x1="${PAD.l}" x2="${W - PAD.r}" y1="${y(t)}" y2="${y(t)}"/>
        <text class="tick-label" x="${PAD.l - 8}" y="${y(t) + 4}" text-anchor="end">${esc(fmt(t))}</text>`).join('')}
      <line class="axis" x1="${PAD.l}" x2="${W - PAD.r}" y1="${PAD.t + ih}" y2="${PAD.t + ih}"/>
      ${points.map((_, i) => (i % xEvery === 0 || i === points.length - 1) ? `<text class="tick-label" x="${x(i)}" y="${H - 6}" text-anchor="middle">${esc(xLabel(i))}</text>` : '').join('')}
      <path class="area" d="${area}"/>
      <path class="line" d="${line}"/>
      ${showDots ? points.map((p, i) => `<circle class="dot" cx="${x(i)}" cy="${y(p.y)}" r="4"/>`).join('') : ''}
      <line class="crosshair" x1="0" x2="0" y1="${PAD.t}" y2="${PAD.t + ih}" visibility="hidden"/>
      <circle class="hover-dot" r="6" visibility="hidden"/>
      <rect class="hit" x="${PAD.l - 10}" y="0" width="${iw + 20}" height="${H}" fill="transparent"/>
    </svg>
    <div class="chart-tip" hidden></div>
  </div>`;

  const svg = container.querySelector('svg');
  const tip = container.querySelector('.chart-tip');
  const cross = svg.querySelector('.crosshair');
  const hdot = svg.querySelector('.hover-dot');
  const hide = () => { tip.hidden = true; cross.setAttribute('visibility', 'hidden'); hdot.setAttribute('visibility', 'hidden'); };

  svg.querySelector('.hit').addEventListener('pointermove', (e) => {
    const r = svg.getBoundingClientRect();
    const sx = ((e.clientX - r.left) / r.width) * W;
    const i = points.length === 1 ? 0 : Math.round(((sx - PAD.l) / iw) * (points.length - 1));
    const k = Math.max(0, Math.min(points.length - 1, i));
    const px = x(k);
    const py = y(points[k].y);
    cross.setAttribute('x1', px); cross.setAttribute('x2', px); cross.setAttribute('visibility', 'visible');
    hdot.setAttribute('cx', px); hdot.setAttribute('cy', py); hdot.setAttribute('visibility', 'visible');
    tip.innerHTML = points[k].tip;
    tip.hidden = false;
    const left = (px / W) * r.width;
    tip.style.left = `${Math.min(Math.max(left, 70), r.width - 70)}px`;
    tip.style.top = `${(py / H) * r.height}px`;
  });
  svg.querySelector('.hit').addEventListener('pointerleave', hide);
}
