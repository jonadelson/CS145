// Service worker: offline-first for the app shell and embedded content.
// Videos stream from cs145.web.app and are never cached here.
const VERSION = 'v1';
const CACHE = `cs145study-${VERSION}`;

const SHELL = [
  './',
  'index.html',
  'manifest.webmanifest',
  'app/app.js', 'app/ui.js', 'app/data.js', 'app/store.js', 'app/srs.js',
  'app/styles.css', 'app/content.css', 'app/v5-tokens.css',
  'app/views/home.js', 'app/views/learn.js', 'app/views/reader.js',
  'app/views/practice.js', 'app/views/cards.js', 'app/views/search.js',
  'app/views/progress.js', 'app/views/viz.js', 'app/views/more.js',
  'content/manifest.json',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET') return;
  if (url.origin !== location.origin) return; // videos, fonts: straight to network

  // cache-first with background refresh for same-origin content
  e.respondWith(
    caches.match(e.request).then((hit) => {
      const refresh = fetch(e.request)
        .then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(e.request, copy));
          }
          return res;
        })
        .catch(() => hit);
      return hit || refresh;
    }));
});
