// Service Worker for Exam Portal PWA - Auto-Update Enabled
const CACHE_NAME = 'exam-portal-v3';
const PRECACHE_URLS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/icon.svg',
  '/pwa-192x192.png',
  '/pwa-512x512.png',
  '/pwa-maskable-512x512.png'
];

self.addEventListener('install', (event) => {
  // Pre-cache essential assets
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(PRECACHE_URLS).catch((err) => {
        console.warn('[SW] Pre-caching warning:', err);
      });
    })
  );
  // Force active immediately without waiting
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  // Clear any older caches
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      );
    })
  );
  // Claim all clients immediately so controllerchange fires in web clients
  self.clients.claim();
});

// Listen for message from client to skipWaiting
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

self.addEventListener('fetch', (event) => {
  const url = event.request.url;

  // CRITICAL: Always bypass Service Worker cache for Firebase, Firestore, Google APIs, and non-GET requests
  // This ensures 100% real-time Firestore synchronization without stale cache interference
  if (
    event.request.method !== 'GET' ||
    url.includes('firestore.googleapis.com') ||
    url.includes('googleapis.com') ||
    url.includes('firebasedatabase.app') ||
    url.includes('firebaseio.com') ||
    url.includes('firebase.com') ||
    url.includes('firebasestorage.app') ||
    url.includes('identitytoolkit') ||
    url.includes('securetoken') ||
    url.includes('youtube.com') ||
    url.includes('youtube-nocookie.com')
  ) {
    return;
  }

  // Network-First for Navigation requests (ensures new deployed HTML is always picked up when online)
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request, { cache: 'no-cache' })
        .then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            const responseClone = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(event.request, responseClone);
            });
          }
          return networkResponse;
        })
        .catch(() => {
          return caches.match('/index.html').then((cached) => cached || caches.match('/'));
        })
    );
    return;
  }

  // Stale-While-Revalidate for other static assets
  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      const fetchPromise = fetch(event.request)
        .then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            const responseClone = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(event.request, responseClone);
            });
          }
          return networkResponse;
        })
        .catch(() => cachedResponse);

      return cachedResponse || fetchPromise;
    })
  );
});
