// Procedural cartoon faces (SVG). The same seed always gives the same face.
import { mulberry32 } from '../utils.js';

const SKIN = ['#fde3cf', '#f6cba5', '#e8b48c', '#d39a6a', '#b07a4f', '#8d5a3b', '#6b4329', '#4a2e1c'];
const HAIR = ['#1b1b1b', '#3b2416', '#6a4325', '#a0662f', '#d6a65a', '#e8d29a', '#b33a1e', '#8a8a8a', '#e9e9e9', '#5b3b8c'];
const BG = ['#c7d2fe', '#bae6fd', '#bbf7d0', '#fde68a', '#fecaca', '#e9d5ff', '#fbcfe8', '#a7f3d0', '#fed7aa', '#ddd6fe'];
const SHIRT = ['#1d4ed8', '#be123c', '#15803d', '#7c3aed', '#0f766e', '#c2410c', '#334155', '#a16207', '#db2777', '#0369a1'];
const EYE = ['#3b2416', '#1f4e79', '#2f6b3a', '#5b5b5b', '#6a4325'];

export function avatarSVG(seed, { size = 140, femme = null } = {}) {
  const r = mulberry32(seed);
  const pick = (a) => a[Math.floor(r() * a.length)];
  const chance = (p) => r() < p;

  const skin = pick(SKIN);
  const hair = pick(HAIR);
  const bg = pick(BG);
  const shirt = pick(SHIRT);
  const eye = pick(EYE);

  const faceW = 30 + r() * 8;        // half-width
  const faceH = 36 + r() * 8;        // half-height
  const cx = 70, cy = 66;
  const eyeY = cy - 4 + r() * 6;
  const eyeDx = 11 + r() * 5;
  const eyeR = 2.6 + r() * 1.6;
  const browTilt = (r() - 0.5) * 6;
  const browThick = 2 + r() * 2.5;
  const mouthY = cy + faceH * 0.55;
  const mouthW = 8 + r() * 8;
  const mouthType = Math.floor(r() * 4);
  // femme: true/false steers hair and facial hair; null = anything goes.
  const styles = femme === true ? [1, 3, 3, 4, 6, 6, 7, 7, 0] : femme === false ? [0, 0, 1, 1, 2, 4, 5, 6] : [0, 1, 2, 3, 4, 5, 6, 7];
  const hairStyle = pick(styles);
  const glasses = chance(0.25);
  const beard = femme !== true && chance(0.3);
  const mustache = femme !== true && !beard && chance(0.18);
  const freckles = chance(0.15);
  const earrings = chance(femme === true ? 0.45 : femme === false ? 0.08 : 0.2);
  const noseType = Math.floor(r() * 3);

  const top = cy - faceH;
  const parts = [];

  parts.push(`<rect width="140" height="140" fill="${bg}"/>`);

  // Long hair behind the head
  if (hairStyle === 3 || hairStyle === 6) {
    parts.push(`<path d="M${cx - faceW - 6} ${cy - 10} Q${cx - faceW - 10} ${cy + 45} ${cx - faceW + 4} ${cy + 52} L${cx + faceW - 4} ${cy + 52} Q${cx + faceW + 10} ${cy + 45} ${cx + faceW + 6} ${cy - 10} Z" fill="${hair}"/>`);
  }

  // Shoulders & neck
  parts.push(`<path d="M20 140 Q24 110 52 104 L88 104 Q116 110 120 140 Z" fill="${shirt}"/>`);
  parts.push(`<rect x="${cx - 10}" y="${cy + faceH - 12}" width="20" height="22" fill="${skin}"/>`);
  parts.push(`<path d="M${cx - 12} 105 L${cx} 116 L${cx + 12} 105" fill="none" stroke="rgba(0,0,0,.25)" stroke-width="2"/>`);

  // Ears
  parts.push(`<ellipse cx="${cx - faceW}" cy="${eyeY + 4}" rx="5" ry="8" fill="${skin}"/>`);
  parts.push(`<ellipse cx="${cx + faceW}" cy="${eyeY + 4}" rx="5" ry="8" fill="${skin}"/>`);
  if (earrings) {
    parts.push(`<circle cx="${cx - faceW}" cy="${eyeY + 14}" r="2.5" fill="#fbbf24"/><circle cx="${cx + faceW}" cy="${eyeY + 14}" r="2.5" fill="#fbbf24"/>`);
  }

  // Face
  parts.push(`<ellipse cx="${cx}" cy="${cy}" rx="${faceW}" ry="${faceH}" fill="${skin}"/>`);

  // Beard
  if (beard) {
    parts.push(`<path d="M${cx - faceW + 2} ${cy + 2} Q${cx - faceW + 4} ${cy + faceH + 8} ${cx} ${cy + faceH + 8} Q${cx + faceW - 4} ${cy + faceH + 8} ${cx + faceW - 2} ${cy + 2} Q${cx} ${cy + 22} ${cx - faceW + 2} ${cy + 2} Z" fill="${hair}"/>`);
  }

  // Hair on top
  const h = hair;
  switch (hairStyle) {
    case 0: // short crop
      parts.push(`<path d="M${cx - faceW} ${cy - 6} Q${cx - faceW} ${top - 6} ${cx} ${top - 6} Q${cx + faceW} ${top - 6} ${cx + faceW} ${cy - 6} Q${cx + faceW - 4} ${top + 12} ${cx} ${top + 10} Q${cx - faceW + 4} ${top + 12} ${cx - faceW} ${cy - 6} Z" fill="${h}"/>`);
      break;
    case 1: // side part
      parts.push(`<path d="M${cx - faceW - 2} ${cy} Q${cx - faceW - 4} ${top - 8} ${cx + 4} ${top - 6} Q${cx + faceW + 4} ${top - 2} ${cx + faceW + 1} ${cy - 4} Q${cx + 10} ${top + 6} ${cx - 8} ${top + 14} Q${cx - faceW + 6} ${top + 18} ${cx - faceW - 2} ${cy} Z" fill="${h}"/>`);
      break;
    case 2: // bald with sides
      parts.push(`<path d="M${cx - faceW} ${cy - 2} Q${cx - faceW - 2} ${cy - 18} ${cx - faceW + 6} ${cy - 22} L${cx - faceW + 6} ${cy + 2} Z" fill="${h}"/><path d="M${cx + faceW} ${cy - 2} Q${cx + faceW + 2} ${cy - 18} ${cx + faceW - 6} ${cy - 22} L${cx + faceW - 6} ${cy + 2} Z" fill="${h}"/>`);
      break;
    case 3: // long, fringe
      parts.push(`<path d="M${cx - faceW - 4} ${cy} Q${cx - faceW - 2} ${top - 10} ${cx} ${top - 8} Q${cx + faceW + 2} ${top - 10} ${cx + faceW + 4} ${cy} Q${cx + faceW - 6} ${top + 14} ${cx} ${top + 16} Q${cx - faceW + 6} ${top + 14} ${cx - faceW - 4} ${cy} Z" fill="${h}"/>`);
      break;
    case 4: // curly
      for (let i = 0; i < 9; i++) {
        const a = Math.PI + (i / 8) * Math.PI;
        parts.push(`<circle cx="${cx + Math.cos(a) * (faceW + 2)}" cy="${cy - 8 + Math.sin(a) * (faceH + 2)}" r="${9 + r() * 3}" fill="${h}"/>`);
      }
      break;
    case 5: // spiky
      {
        let d = `M${cx - faceW} ${cy - 8}`;
        for (let i = 0; i <= 6; i++) {
          const x = cx - faceW + (i * 2 * faceW) / 6;
          d += ` L${x - faceW / 6} ${top + 4} L${x} ${top - 12 - r() * 6}`;
        }
        d += ` L${cx + faceW} ${cy - 8} Q${cx} ${top + 8} ${cx - faceW} ${cy - 8} Z`;
        parts.push(`<path d="${d}" fill="${h}"/>`);
      }
      break;
    case 6: // long, middle part
      parts.push(`<path d="M${cx - faceW - 4} ${cy + 4} Q${cx - faceW - 6} ${top - 8} ${cx} ${top - 6} Q${cx + faceW + 6} ${top - 8} ${cx + faceW + 4} ${cy + 4} Q${cx + faceW - 2} ${top + 8} ${cx} ${top + 4} Q${cx - faceW + 2} ${top + 8} ${cx - faceW - 4} ${cy + 4} Z" fill="${h}"/>`);
      break;
    case 7: // bun
      parts.push(`<circle cx="${cx}" cy="${top - 10}" r="13" fill="${h}"/>`);
      parts.push(`<path d="M${cx - faceW} ${cy - 6} Q${cx - faceW} ${top - 4} ${cx} ${top - 4} Q${cx + faceW} ${top - 4} ${cx + faceW} ${cy - 6} Q${cx} ${top + 8} ${cx - faceW} ${cy - 6} Z" fill="${h}"/>`);
      break;
  }

  // Brows
  const browY = eyeY - 9;
  [-1, 1].forEach((s) => {
    const x = cx + s * eyeDx;
    parts.push(`<path d="M${x - 6} ${browY + s * browTilt * -0.5} L${x + 6} ${browY + s * browTilt * 0.5}" stroke="${hair === '#e9e9e9' ? '#9a9a9a' : hair}" stroke-width="${browThick}" stroke-linecap="round"/>`);
  });

  // Eyes
  [-1, 1].forEach((s) => {
    const x = cx + s * eyeDx;
    parts.push(`<ellipse cx="${x}" cy="${eyeY}" rx="${eyeR + 2.2}" ry="${eyeR + 1.4}" fill="#fff"/>`);
    parts.push(`<circle cx="${x}" cy="${eyeY + 0.5}" r="${eyeR}" fill="${eye}"/>`);
    parts.push(`<circle cx="${x + 1}" cy="${eyeY - 0.6}" r="${eyeR * 0.35}" fill="#fff"/>`);
  });

  if (glasses) {
    const gr = eyeR + 6;
    parts.push(`<g fill="none" stroke="#222" stroke-width="2"><circle cx="${cx - eyeDx}" cy="${eyeY}" r="${gr}"/><circle cx="${cx + eyeDx}" cy="${eyeY}" r="${gr}"/><path d="M${cx - eyeDx + gr} ${eyeY} L${cx + eyeDx - gr} ${eyeY}"/></g>`);
  }

  // Nose
  const ny = eyeY + 14;
  if (noseType === 0) parts.push(`<path d="M${cx} ${eyeY + 4} L${cx - 4} ${ny} L${cx + 2} ${ny}" fill="none" stroke="rgba(0,0,0,.35)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`);
  else if (noseType === 1) parts.push(`<ellipse cx="${cx}" cy="${ny - 1}" rx="4" ry="3" fill="rgba(0,0,0,.15)"/>`);
  else parts.push(`<path d="M${cx - 5} ${ny} Q${cx} ${ny + 4} ${cx + 5} ${ny}" fill="none" stroke="rgba(0,0,0,.35)" stroke-width="2" stroke-linecap="round"/>`);

  if (freckles) {
    for (let i = 0; i < 6; i++) {
      const s = i < 3 ? -1 : 1;
      parts.push(`<circle cx="${cx + s * (eyeDx - 4 + (i % 3) * 4)}" cy="${ny - 2 + (i % 2) * 3}" r="1" fill="rgba(120,60,20,.5)"/>`);
    }
  }

  if (mustache) parts.push(`<path d="M${cx - 10} ${mouthY - 5} Q${cx} ${mouthY - 11} ${cx + 10} ${mouthY - 5} Q${cx} ${mouthY - 7} ${cx - 10} ${mouthY - 5} Z" fill="${hair}" stroke="${hair}" stroke-width="2"/>`);

  // Mouth
  const mc = beard ? '#fff' : '#7a2e2e';
  if (mouthType === 0) parts.push(`<path d="M${cx - mouthW} ${mouthY - 2} Q${cx} ${mouthY + 8} ${cx + mouthW} ${mouthY - 2}" fill="none" stroke="${mc}" stroke-width="2.5" stroke-linecap="round"/>`);
  else if (mouthType === 1) parts.push(`<path d="M${cx - mouthW * 0.7} ${mouthY} L${cx + mouthW * 0.7} ${mouthY}" stroke="${mc}" stroke-width="2.5" stroke-linecap="round"/>`);
  else if (mouthType === 2) parts.push(`<path d="M${cx - mouthW} ${mouthY - 3} Q${cx} ${mouthY + 10} ${cx + mouthW} ${mouthY - 3} Z" fill="#7a2e2e"/><path d="M${cx - mouthW + 3} ${mouthY - 2} L${cx + mouthW - 3} ${mouthY - 2}" stroke="#fff" stroke-width="2.5"/>`);
  else parts.push(`<ellipse cx="${cx}" cy="${mouthY + 1}" rx="${mouthW * 0.4}" ry="3.5" fill="#7a2e2e"/>`);

  return `<svg viewBox="0 0 140 140" width="${size}" height="${size}" role="img" aria-label="Generated face">${parts.join('')}</svg>`;
}
