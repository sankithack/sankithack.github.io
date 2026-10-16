// Run before committing changes to the chess site:  npm run precommit
// 1. regenerates offline-files.json (the service worker's file list)
// 2. validates every move sequence and claim in data/
// Exits non-zero if validation fails; tells you when offline-files.json changed and needs staging.
import { readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { offlineList } from './build-offline.mjs';

const root = new URL('..', import.meta.url).pathname;
const file = root + 'offline-files.json';
const before = (() => { try { return readFileSync(file, 'utf8'); } catch { return ''; } })();
const list = offlineList();
const after = JSON.stringify(list, null, 1) + '\n';
if (after !== before) {
  writeFileSync(file, after);
  console.log(`• offline-files.json updated (version ${list.version}, ${list.files.length} files) — stage it with your commit.`);
} else console.log('• offline-files.json already up to date.');

const v = spawnSync(process.execPath, [root + 'scripts/validate-data.mjs'], { stdio: 'inherit' });
if (v.status !== 0) { console.error('✗ Validation failed — fix the errors above before committing.'); process.exit(1); }
console.log('✓ Ready to commit.');
