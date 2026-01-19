const CACHE_NAME = 'rs-audio-v9';
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/index.tsx',
  '/App.tsx',
  '/manifest.json',
  '/logo.png',
  '/favicon.ico'
];

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS))
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key)));
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // NO-INTERFERE: Early return for DuckDNS and API requests to avoid CORS/latency hangs
  if (
    url.hostname.includes('duckdns.org') || 
    url.pathname.includes('/api/') ||
    url.pathname.includes('/socket.io') ||
    url.pathname.endsWith('.m3u8') || 
    url.pathname.endsWith('.ts')
  ) {
    return;
  }

  // Only handle cache for known static UI assets
  if (STATIC_ASSETS.includes(url.pathname) || url.pathname.startsWith('/assets/')) {
    event.respondWith(
      caches.match(event.request).then((response) => {
        return response || fetch(event.request);
      })
    );
    return;
  }

  // Default to network for everything else
  return;
});