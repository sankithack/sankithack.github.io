// Your progress: summary, backup download, restore (file or paste), reset.
import { h, icon } from '../lib/dom.js';
import { progress, restoreProgress, resetProgress } from '../lib/store.js';
import { makeBackup, parseBackup, mergeProgress, summarise } from '../lib/progress-io.js';
import { page, pageHead, chips } from './common.js';

export function render(data) {
  const statsEl = h('dl.progress-stats');
  const paintStats = () => statsEl.replaceChildren(...summarise(progress(), data).flatMap(([label, n, of]) => [h('dt', label), h('dd', of ? `${n} / ${of}` : String(n))]));
  paintStats();
  const msg = h('p.io-msg', { role: 'status' });
  const say = (kind, text) => { msg.className = 'io-msg io-' + kind; msg.textContent = text; };
  let mode = 'merge';

  const download = () => {
    const blob = new Blob([JSON.stringify(makeBackup(progress()), null, 2)], { type: 'application/json' });
    const a = h('a', { href: URL.createObjectURL(blob), download: `chess-academy-progress-${new Date().toISOString().slice(0, 10)}.json` });
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    say('good', 'Backup downloaded. Keep the file somewhere safe, or open it on another device to restore.');
  };
  const copy = async () => {
    const text = JSON.stringify(makeBackup(progress()));
    try { await navigator.clipboard.writeText(text); say('good', 'Backup copied. Paste it into the box on your other device.'); }
    catch { pasteBox.value = text; pasteBox.select(); say('good', 'Your browser blocked the clipboard — the backup is in the box below; copy it from there.'); }
  };
  const restore = (text) => {
    try {
      const next = parseBackup(text);
      restoreProgress(next, mode, mergeProgress);
      paintStats();
      say('good', mode === 'merge' ? 'Backup merged with your progress here. Nothing was lost.' : 'Progress replaced with the backup.');
    } catch (e) { say('bad', e.message); }
  };
  const file = h('input.visually-hidden#restore-file', { type: 'file', accept: 'application/json,.json', onchange: async (e) => { const f = e.target.files[0]; if (f) restore(await f.text()); e.target.value = ''; } });
  const pasteBox = h('textarea.pgn-input', { rows: 3, placeholder: 'Or paste a backup here', 'aria-label': 'Paste a backup' });
  let armed = false;
  const resetBtn = h('button.btn.btn-danger', { type: 'button', onclick: () => {
    if (!armed) { armed = true; resetBtn.textContent = 'Click again to erase everything'; setTimeout(() => { armed = false; resetBtn.textContent = 'Reset all progress'; }, 4000); return; }
    resetProgress(); paintStats(); armed = false; resetBtn.textContent = 'Reset all progress'; say('good', 'All progress erased.');
  } }, 'Reset all progress');

  return page('Your progress',
    pageHead('Your progress', 'Progress lives in this browser. Back it up to keep it safe, or move it to another phone or computer.'),
    h('div.progress-grid',
      h('section.io-card', h('h2', 'Summary'), statsEl, h('p', h('a', { href: '#/week' }, 'See your week'), ' · ', h('a', { href: '#/guide' }, 'See your roadmap'))),
      h('section.io-card',
        h('h2', 'Back up'),
        h('p.muted', 'Download a small file with everything you have studied, solved and practised.'),
        h('div.puzzle-actions',
          h('button.btn.btn-primary', { type: 'button', onclick: download }, icon('arrow', 16), 'Download backup'),
          h('button.btn', { type: 'button', onclick: copy }, 'Copy as text'))),
      h('section.io-card',
        h('h2', 'Restore'),
        h('div.filter-row', h('span.filter-label', 'When restoring'), chips('Restore mode', [['merge', 'Merge with this device'], ['replace', 'Replace this device']], mode, (v) => { mode = v; })),
        h('div.puzzle-actions', h('label.btn', { for: 'restore-file' }, 'Choose backup file'), file),
        pasteBox,
        h('button.btn', { type: 'button', onclick: () => pasteBox.value.trim() ? restore(pasteBox.value) : say('bad', 'Paste a backup first.') }, 'Restore from text')),
      h('section.io-card.io-danger', h('h2', 'Start over'), h('p.muted', 'Erase all progress on this device. Download a backup first if you might want it back.'), resetBtn)),
    msg);
}
