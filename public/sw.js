// Service Worker for Exam Portal PWA - Auto-Update Enabled for Installed PWAs
const CACHE_NAME = 'exam-portal-app-v6';
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
  // Pre-cache essential shell assets
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(PRECACHE_URLS).catch((err) => {
        console.warn('[SW] Pre-caching warning:', err);
      });
    })
  );
  // Force activate immediately without waiting for existing clients to close
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  // Purge any older caches so installed apps do not serve stale code
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      );
    })
  );
  // Take control of all open and installed standalone clients immediately
  self.clients.claim();
});

// Listen for message from client to force activate immediately
self.addEventListener('message', (event) => {
  if (event.data && (event.data.type === 'SKIP_WAITING' || event.data.action === 'skipWaiting')) {
    self.skipWaiting();
  }
});

self.addEventListener('fetch', (event) => {
  const url = event.request.url;

  // CRITICAL: Always bypass Service Worker cache for development, Vite HMR, Firebase, Firestore, Google APIs, and non-GET requests
  // This ensures 100% real-time synchronization without stale cache interference
  if (
    event.request.method !== 'GET' ||
    url.includes('/@vite/') ||
    url.includes('/@fs/') ||
    url.includes('/src/') ||
    url.includes('/node_modules/') ||
    url.includes('/api/') ||
    url.includes('hot-update') ||
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

  // Network-First for Navigation requests (ensures new deployed HTML is always picked up immediately in installed PWAs)
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
