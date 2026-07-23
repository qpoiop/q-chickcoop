// CHICKCOOP service worker — versioned runtime cache for offline play + fast
// repeat loads. The build id rides in the registration URL (?v=...), so each
// deploy gets a fresh cache and old ones are purged on activate.

const VER = new URL(self.location).searchParams.get('v') || '0';
const CACHE = 'chickcoop-' + VER;

self.addEventListener('install', (e) => {
  // Take over ASAP so a new deploy applies on the next visit WITHOUT waiting for a
  // manual "update" tap — stale caches were pinning users to old builds.
  self.skipWaiting();
  // Warm the shell; hashed assets are cached lazily on first fetch.
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(['./', './index.html'])).catch(() => {}));
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k.startsWith('chickcoop-') && k !== CACHE).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

// Manual-update handshake: the page posts SKIP_WAITING, we take over immediately.
self.addEventListener('message', (e) => { if (e.data && e.data.type === 'SKIP_WAITING') self.skipWaiting(); });

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // let cross-origin (fonts) pass through

  // Navigations: network-first, fall back to cached shell (SPA offline).
  if (req.mode === 'navigate') {
    e.respondWith(fetch(req).catch(() => caches.match('./index.html')));
    return;
  }

  // Static assets (JS/CSS/GLB/audio/images): cache-first, then network+store.
  e.respondWith((async () => {
    const cached = await caches.match(req);
    if (cached) return cached;
    try {
      const res = await fetch(req);
      if (res && res.ok && res.type === 'basic') { const c = await caches.open(CACHE); c.put(req, res.clone()); }
      return res;
    } catch (err) {
      return cached || Response.error();
    }
  })());
});
