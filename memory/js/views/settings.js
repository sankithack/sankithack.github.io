import { db, update, settings, exportData, importData, resetAll } from '../storage.js';
import { applyTheme } from '../app.js';
import { esc, toast, $ } from '../utils.js';

export function render(el) {
  const s = settings();
  const d = db();
  const voices = window.speechSynthesis ? speechSynthesis.getVoices().filter((v) => v.lang.startsWith('en')) : [];

  el.innerHTML = `
    <div class="page-head"><h1>Settings</h1><p>Preferences and your data backup.</p></div>
    <div class="stack">
      <section class="card">
        <h2>Preferences</h2>
        <div class="form-grid">
          <div class="field">
            <label for="theme">Theme</label>
            <select id="theme">
              <option value="auto">Match device</option>
              <option value="light">Light</option>
              <option value="dark">Dark</option>
            </select>
          </div>
          <div class="field">
            <label for="newPerDay">New flashcards per day <span class="hint">per deck</span></label>
            <input id="newPerDay" type="number" min="0" max="100" value="${s.newPerDay}">
          </div>
          <div class="field">
            <label for="speechRate">Spoken numbers speed <span class="hint">digits per second</span></label>
            <select id="speechRate">
              ${[0.5, 0.75, 1, 1.5, 2].map((r) => `<option value="${r}">${r} / sec</option>`).join('')}
            </select>
          </div>
          <div class="field">
            <label for="voice">Voice</label>
            <select id="voice">
              <option value="">Browser default</option>
              ${voices.map((v) => `<option value="${esc(v.name)}">${esc(v.name)} (${esc(v.lang)})</option>`).join('')}
            </select>
          </div>
        </div>
        <hr>
        <label class="check"><input type="checkbox" id="strict"> Championship scoring (strict)</label>
        <p class="small muted mt0">Scores rows the way memory championships do: a perfect row scores full points, a row with one mistake scores half, and two or more mistakes score zero. Spoken numbers stop counting at the first mistake.</p>
      </section>

      <section class="card">
        <h2>Your data</h2>
        <p class="muted">Everything is stored only in this browser. Export a backup regularly, especially before you clear your browser data or switch devices.</p>
        <p class="small">${d.results.length} event sessions · ${d.palaces.length} palaces · ${Object.keys(d.srs).length} flashcards studied</p>
        <div class="btn-row">
          <button class="btn primary" id="export">Export backup (JSON)</button>
          <label class="btn" for="importFile">Import backup…</label>
          <input id="importFile" type="file" accept="application/json,.json" class="hidden">
        </div>
        <hr>
        <button class="btn danger" id="reset">Reset all data…</button>
      </section>

      <section class="card soft small">
        <h3>About</h3>
        <p class="mb0">Loci works offline once loaded. Install it on your phone with your browser's “Add to Home Screen”.</p>
      </section>
    </div>`;

  $('#theme', el).value = s.theme;
  $('#speechRate', el).value = String(s.speechRate);
  $('#voice', el).value = s.voice;
  $('#strict', el).checked = s.strict;

  const set = (key, val) => update((d) => { d.settings[key] = val; });
  $('#theme', el).onchange = (e) => { set('theme', e.target.value); applyTheme(); };
  $('#newPerDay', el).onchange = (e) => set('newPerDay', Math.max(0, Math.min(100, Number(e.target.value) || 0)));
  $('#speechRate', el).onchange = (e) => set('speechRate', Number(e.target.value));
  $('#voice', el).onchange = (e) => set('voice', e.target.value);
  $('#strict', el).onchange = (e) => set('strict', e.target.checked);

  $('#export', el).onclick = () => { exportData(); toast('Backup downloaded'); };
  $('#importFile', el).onchange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (!confirm('Importing replaces ALL current data in this browser with the backup. Continue?')) { e.target.value = ''; return; }
    try {
      await importData(file);
      applyTheme();
      toast('Backup imported');
      render(el);
    } catch (err) {
      alert(`Import failed: ${err.message}`);
    }
  };
  $('#reset', el).onclick = () => {
    if (!confirm('Delete ALL progress, palaces, custom images and scores? This cannot be undone.')) return;
    if (!confirm('Really delete everything? Consider exporting a backup first.')) return;
    resetAll();
    applyTheme();
    toast('All data reset');
    render(el);
  };

  // Voices load asynchronously in some browsers.
  if (window.speechSynthesis && !voices.length) {
    speechSynthesis.onvoiceschanged = () => { speechSynthesis.onvoiceschanged = null; if (el.isConnected && location.hash.includes('settings')) render(el); };
  }
}
