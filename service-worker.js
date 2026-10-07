// Offline cache for Salon Pro. Bump VERSION whenever any file in SHELL changes.
const VERSION = 'salonpro-v1.0.0';
const SHELL = [
  './', './index.html', './manifest.json', './css/style.css', './icons/icon.svg',
  './js/app.js', './js/store.js', './js/util.js',
  './js/views/dashboard.js', './js/views/calendar.js', './js/views/billing.js',
  './js/views/invoices.js', './js/views/services.js', './js/views/staff.js',
  './js/views/customers.js', './js/views/products.js', './js/views/payroll.js',
  './js/views/reports.js', './js/views/settings.js',
];
const CDN_HOSTS = ['cdn.jsdelivr.net', 'fonts.googleapis.com', 'fonts.gstatic.com'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL.map((u) => new Request(u, { cache: 'reload' }))))
    .then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    for (const key of await caches.keys()) if (key.startsWith('salonpro-') && key !== VERSION) await caches.delete(key);
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  const sameOrigin = url.origin === self.location.origin;
  if (!sameOrigin && !CDN_HOSTS.includes(url.hostname)) return;

  e.respondWith((async () => {
    const cache = await caches.open(VERSION);
    const cached = await cache.match(req, { ignoreSearch: sameOrigin });
    if (cached) return cached;
    try {
      const res = await fetch(req);
      if (res.ok && (res.type === 'basic' || res.type === 'cors')) cache.put(req, res.clone());
      return res;
    } catch (err) {
      if (req.mode === 'navigate') return (await cache.match('./index.html')) || Response.error();
      return Response.error();
    }
  })());
});
