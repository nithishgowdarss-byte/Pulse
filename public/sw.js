// public/sw.js
const CACHE = 'pulse-shell-v1';
const SHELL = [
  '/',
  '/index.html',
  '/manifest.webmanifest',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/icon-512-maskable.png',
  '/icons/icon.svg'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Always network for API, dev-server, models, Vite internals, and non-GET routes
  if (
    url.hostname.includes('supabase.co') ||
    url.pathname.startsWith('/api') ||
    url.pathname.startsWith('/v1') ||
    url.pathname.startsWith('/@') ||
    url.pathname.startsWith('/src') ||
    url.pathname.startsWith('/node_modules') ||
    url.pathname.startsWith('/functions') ||
    url.pathname.endsWith('.pdf') ||
    url.pathname.endsWith('.txt') ||
    request.method !== 'GET'
  ) {
    return; // browser default = network
  }

  // Navigations: network first, fallback to cached index.html
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((res) => {
          if (res.ok && url.origin === self.location.origin) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(request, copy)).catch(() => {});
          }
          return res;
        })
        .catch(() => caches.match('/index.html'))
    );
    return;
  }

  // Static assets & icons: cache first with network fallback
  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;
      return fetch(request)
        .then((res) => {
          if (res.ok && url.origin === self.location.origin) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(request, copy)).catch(() => {});
          }
          return res;
        })
        .catch(() => {
          // Fallback to cached index or empty offline response without throwing
          return caches.match('/index.html').then((fallback) => {
            return fallback || new Response('Offline', { status: 503, statusText: 'Offline' });
          });
        });
    }).catch(() => {
      return new Response('Offline', { status: 503, statusText: 'Offline' });
    })
  );
});
