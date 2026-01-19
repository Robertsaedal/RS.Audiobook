
const CACHE_NAME = 'aether-v2';
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS))
  );
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Cache book covers for offline use
  if (url.pathname.includes('/cover')) {
    event.respondWith(
      caches.open('abs-covers').then((cache) => {
        return cache.match(event.request).then((response) => {
          return response || fetch(event.request).then((networkResponse) => {
            cache.put(event.request, networkResponse.clone());
            return networkResponse;
          });
        });
      })
    );
    return;
  }

  event.respondWith(
    caches.match(event.request).then((response) => {
      return response || fetch(event.request);
    })
  );
});

// Background sync for progress updates if supported
self.addEventListener('sync', (event) => {
  if (event.tag === 'abs-sync-progress') {
    event.waitUntil(Promise.resolve()); // Handled in-app by ABSService onOnline
  }
});
