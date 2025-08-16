// sw.js - Service Worker for FinanceBot PWA
const CACHE_NAME = 'financebot-v1';
const OFFLINE_URL = '/offline.html';

// Files to cache for offline functionality
const urlsToCache = [
  '/',
  '/index.html',
  '/style.css',
  '/script.js',
  '/manifest.json',
  OFFLINE_URL
];

// Install event - cache essential resources
self.addEventListener('install', (event) => {
  console.log('Service Worker installing...');
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('Caching essential resources');
        return cache.addAll(urlsToCache);
      })
      .then(() => {
        // Skip waiting to activate immediately
        return self.skipWaiting();
      })
  );
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
  console.log('Service Worker activating...');
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            console.log('Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => {
      // Take control of all clients immediately
      return self.clients.claim();
    })
  );
});

// Fetch event - handle network requests
self.addEventListener('fetch', (event) => {
  // Handle chatbot API requests
  if (event.request.url.includes('/chatbot')) {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          // If online, return the response
          return response;
        })
        .catch(() => {
          // If offline, return a cached offline response
          return new Response(JSON.stringify({
            reply: "Maaf, saya sedang offline. Silakan coba lagi ketika koneksi internet tersedia. Sementara itu, Anda bisa membaca tips keuangan yang tersimpan di aplikasi."
          }), {
            headers: {
              'Content-Type': 'application/json',
            },
          });
        })
    );
    return;
  }

  // Handle navigation requests
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request)
        .catch(() => {
          // If offline, serve cached page or offline page
          return caches.match('/index.html')
            .then((response) => {
              return response || caches.match(OFFLINE_URL);
            });
        })
    );
    return;
  }

  // Handle other requests with cache-first strategy
  event.respondWith(
    caches.match(event.request)
      .then((response) => {
        // Return cached version or fetch from network
        return response || fetch(event.request)
          .then((fetchResponse) => {
            // Cache successful responses
            if (fetchResponse.status === 200) {
              const responseClone = fetchResponse.clone();
              caches.open(CACHE_NAME)
                .then((cache) => {
                  cache.put(event.request, responseClone);
                });
            }
            return fetchResponse;
          })
          .catch(() => {
            // If request fails and no cache available
            if (event.request.destination === 'image') {
              // Return a placeholder for images
              return new Response('', { status: 200, statusText: 'OK' });
            }
            // For other resources, return empty response
            return new Response('', { status: 200, statusText: 'OK' });
          });
      })
  );
});

// Background sync for offline messages (if supported)
self.addEventListener('sync', (event) => {
  if (event.tag === 'background-sync') {
    console.log('Background sync triggered');
    // Here you could implement queuing of offline messages
    // and send them when connection is restored
  }
});

// Push notification handling (for future features)
self.addEventListener('push', (event) => {
  if (event.data) {
    const data = event.data.json();
    const options = {
      body: data.body || 'Tips keuangan baru tersedia!',
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      tag: 'finance-notification',
      actions: [
        {
          action: 'view',
          title: 'Lihat Tips'
        },
        {
          action: 'dismiss',
          title: 'Tutup'
        }
      ]
    };

    event.waitUntil(
      self.registration.showNotification(data.title || 'FinanceBot', options)
    );
  }
});

// Handle notification clicks
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  if (event.action === 'view') {
    // Open the app
    event.waitUntil(
      clients.openWindow('/')
    );
  }
});

// Message handling from main thread
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
