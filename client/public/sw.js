// Service worker minimal : cache des assets de l'app shell, réseau d'abord pour tout le reste.
const CACHE = 'lg-v2';
const CORE = ['/', '/assets/favicon.svg', '/manifest.webmanifest'];
self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(CORE)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  // Ne jamais intercepter les WebSockets ou les requêtes API temps réel.
  if (url.pathname.startsWith('/socket.io') || url.pathname.startsWith('/api')) return;
  if (e.request.method !== 'GET') return;
  e.respondWith(
    fetch(e.request).then((r) => {
      const copy = r.clone();
      if (r.ok && (url.pathname.startsWith('/assets/') || url.pathname === '/' || url.pathname.endsWith('.js') || url.pathname.endsWith('.css')))
        caches.open(CACHE).then((c) => c.put(e.request, copy));
      return r;
    }).catch(() => caches.match(e.request).then((c) => c || caches.match('/'))),
  );
});
