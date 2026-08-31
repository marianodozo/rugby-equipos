/* Service worker mínimo: cachea el shell para que la app abra rápido.
   Las llamadas a /api/ NUNCA se cachean (siempre datos frescos). */
const CACHE = 'equipos-v9';
const SHELL = ['/', '/index.html', '/styles.css', '/app.js', '/manifest.json', '/logo.png', '/icon-192.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.pathname.startsWith('/api/')) return;
  // El código de la app se pide siempre a la red saltando la caché HTTP del
  // navegador: si no, una copia vieja guardada con max-age puede tapar un
  // deploy nuevo aunque el servidor ya tenga la versión buena.
  const esCodigo = /\.(html|js|css|json|webmanifest)$/i.test(url.pathname) || e.request.mode === 'navigate';
  e.respondWith(
    fetch(e.request, esCodigo ? { cache: 'no-store' } : undefined)
      .then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(e.request, copy)).catch(() => {});
        return res;
      })
      .catch(() => caches.match(e.request).then((r) => r || caches.match('/index.html')))
  );
});
