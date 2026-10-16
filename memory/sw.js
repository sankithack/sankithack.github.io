// Offline support: precache the whole site, then serve from cache while
// refreshing in the background (stale-while-revalidate).
// Bump VERSION when you add or rename files.
const PREFIX = 'loci-';
const VERSION = `${PREFIX}v3`;
const FACE_COUNT = 101; // keep in sync with js/data/faces.js

const FILES = [
  './',
  './index.html',
  './manifest.webmanifest',
  './icon.svg',
  './css/base.css',
  './css/components.css',
  './js/app.js',
  './js/storage.js',
  './js/utils.js',
  './js/lib/srs.js',
  './js/lib/chart.js',
  './js/lib/speech.js',
  './js/lib/compare.js',
  './js/lib/major.js',
  './js/data/major.js',
  './js/data/pao.js',
  './js/data/cards.js',
  './js/data/names.js',
  './js/data/words.js',
  './js/data/dates.js',
  './js/data/lessons.js',
  './js/data/curriculum.js',
  './js/views/dashboard.js',
  './js/views/learn.js',
  './js/views/systems.js',
  './js/views/palaces.js',
  './js/views/trainers.js',
  './js/views/progress.js',
  './js/views/settings.js',
  './js/views/events/index.js',
  './js/views/events/registry.js',
  './js/views/events/engine.js',
  './js/views/events/numbers.js',
  './js/views/events/phone.js',
  './js/views/events/cards.js',
  './js/views/events/names.js',
  './js/views/events/words.js',
  './js/views/events/binary.js',
  './js/views/events/dates.js',
  './js/views/events/spoken.js',
  './js/lib/demo.js',
  './js/data/demos.js',
  './js/data/faces.js',
  './faces/demo-kamala.jpg',
  // Portrait photos 000.jpg … (FACE_COUNT - 1)
  ...Array.from({ length: FACE_COUNT }, (_, i) => `./faces/${String(i).padStart(3, '0')}.jpg`),
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(VERSION).then((cache) =>
      // Add individually so one missing file doesn't break the whole install.
      Promise.all(FILES.map((f) => cache.add(f).catch(() => console.warn('SW: could not cache', f))))
    ).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      // Only touch our own caches: other apps on the same origin keep theirs.
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith(PREFIX) && k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  event.respondWith(
    caches.open(VERSION).then(async (cache) => {
      const cached = await cache.match(req, { ignoreSearch: true });
      const network = fetch(req)
        .then((res) => {
          if (res.ok) cache.put(req, res.clone());
          return res;
        })
        .catch(() => cached || (req.mode === 'navigate' ? cache.match('./index.html') : undefined));
      if (cached) {
        event.waitUntil(network.catch(() => {}));
        return cached;
      }
      return network;
    })
  );
});
