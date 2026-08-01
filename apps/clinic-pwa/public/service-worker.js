// TANAH-HAIR clinic PWA service worker — minimal offline cache.
const CACHE = 'tanah-hair-clinic-v2';
const PRECACHE = [
  '/clinic/',
  '/clinic/index.html',
  '/clinic/styles.css',
  '/clinic/app.js',
  '/clinic/manifest.webmanifest',
  '/clinic/icon.svg'
];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(PRECACHE)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  // Network-first for the API; cache-first for the static shell.
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(fetch(req).catch(() => new Response(JSON.stringify({ detail: 'offline' }), { status: 503, headers: { 'content-type': 'application/json' } })));
    return;
  }
  event.respondWith(
    caches.match(req).then(cached => cached || fetch(req).then(res => {
      if (res.ok && url.pathname.startsWith('/clinic/')) {
        const copy = res.clone();
        caches.open(CACHE).then(cache => cache.put(req, copy));
      }
      return res;
    }).catch(() => caches.match('/clinic/index.html')))
  );
});
