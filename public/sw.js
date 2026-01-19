
const CACHE_NAME = 'rs-audio-v5';
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/index.tsx',
  '/App.tsx',
  '/manifest.json'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS))
  );
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // CRITICAL: Completely ignore audio streams, fragments, and DuckDNS
  if (
    url.hostname.includes('duckdns.org') || 
    url.pathname.endsWith('.m3u8') || 
    url.pathname.endsWith('.ts') ||
    url.pathname.includes('/hls/')
  ) {
    return;
  }

  // Stale-While-Revalidate Strategy for UI assets
  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      const fetchPromise = fetch(event.request).then((networkResponse) => {
        // Only cache successful static UI requests
        if (networkResponse.ok && (
          url.pathname.endsWith('.js') || 
          url.pathname.endsWith('.css') || 
          url.pathname.endsWith('.png') ||
          url.pathname === '/'
        )) {
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, networkResponse.clone()));
        }
        return networkResponse;
      }).catch(() => cachedResponse);

      return cachedResponse || fetchPromise;
    })
  );
});
