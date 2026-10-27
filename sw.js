/* Province – service worker: network first (so updates show up immediately), cached copy when offline. */
const CACHE = 'province-v1';
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', (e) => {
  const r = e.request;
  if (r.method !== 'GET' || new URL(r.url).origin !== self.location.origin) return;
  e.respondWith(fetch(r, { cache: 'no-cache' }).then((res) => {   // no-cache = ask the server every time (cheap 304 when unchanged)
    const copy = res.clone();
    caches.open(CACHE).then((c) => c.put(r, copy)).catch(() => {});
    return res;
  }).catch(() => caches.match(r)));
});
