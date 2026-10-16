// Writes offline-files.json: every file the service worker should cache for offline use.
// Run after adding or removing files:  node scripts/build-offline.mjs
// (validate-data.mjs fails if the list is out of date.)
import { readdirSync, statSync, writeFileSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, relative } from 'node:path';

const root = new URL('..', import.meta.url).pathname;
const SKIP = new Set(['scripts', 'node_modules', '.git']);
const SKIP_FILES = new Set(['README.md', 'package.json', 'offline-files.json', 'sw.js']);
function walk(dir) {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) return SKIP.has(n) ? [] : walk(p);
    return SKIP_FILES.has(n) || n.startsWith('.') ? [] : [relative(root, p)];
  });
}
export function offlineList() {
  const files = walk(root).sort();
  const hash = createHash('sha256');
  for (const f of files) hash.update(f).update(readFileSync(join(root, f)));
  return { version: hash.digest('hex').slice(0, 12), files: ['./', ...files] };
}
if (process.argv[1]?.endsWith('build-offline.mjs')) {
  const list = offlineList();
  writeFileSync(join(root, 'offline-files.json'), JSON.stringify(list, null, 1) + '\n');
  console.log(`offline-files.json: ${list.files.length} files, version ${list.version}`);
}
