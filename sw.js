const CACHE_NAME = 'aurora-ai-chat-v1.0.0';
const DYNAMIC_CACHE = 'aurora-dynamic-v1.0.0';

// Files to cache for offline functionality
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/style.css',
  '/script.js',
  '/manifest.json',
  // Add icon paths when available
  '/icons/icon-192x192.png',
  '/icons/icon-512x512.png'
];

// API endpoints that can work offline (cached responses)
const CACHEABLE_APIS = [
  '/api/chat-history',
  '/api/user-preferences'
];

// Install event - cache static assets
self.addEventListener('install', event => {
  console.log('Service Worker: Installing...');
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('Service Worker: Caching static assets');
        return cache.addAll(STATIC_ASSETS);
      })
      .then(() => {
        console.log('Service Worker: Static assets cached');
        return self.skipWaiting();
      })
      .catch(error => {
        console.error('Service Worker: Error caching static assets:', error);
      })
  );
});

// Activate event - clean up old caches
self.addEventListener('activate', event => {
  console.log('Service Worker: Activating...');
  event.waitUntil(
    caches.keys()
      .then(cacheNames => {
        return Promise.all(
          cacheNames.map(cacheName => {
            if (cacheName !== CACHE_NAME && cacheName !== DYNAMIC_CACHE) {
              console.log('Service Worker: Deleting old cache:', cacheName);
              return caches.delete(cacheName);
            }
          })
        );
      })
      .then(() => {
        console.log('Service Worker: Claiming clients');
        return self.clients.claim();
      })
  );
});

// Fetch event - implement caching strategies
self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);

  // Handle static assets with cache-first strategy
  if (STATIC_ASSETS.some(asset => url.pathname.includes(asset))) {
    event.respondWith(cacheFirst(request));
    return;
  }

  // Handle API requests
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/chatbot')) {
    event.respondWith(networkFirstWithFallback(request));
    return;
  }

  // Handle navigation requests
  if (request.mode === 'navigate') {
    event.respondWith(networkFirstWithFallback(request));
    return;
  }

  // Default: network first
  event.respondWith(networkFirst(request));
});

// Cache-first strategy (for static assets)
async function cacheFirst(request) {
  try {
    const cachedResponse = await caches.match(request);
    if (cachedResponse) {
      return cachedResponse;
    }
    
    const networkResponse = await fetch(request);
    if (networkResponse.ok) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, networkResponse.clone());
    }
    return networkResponse;
  } catch (error) {
    console.error('Cache-first strategy failed:', error);
    return new Response('Offline content not available', { status: 503 });
  }
}

// Network-first strategy
async function networkFirst(request) {
  try {
    const networkResponse = await fetch(request);
    if (networkResponse.ok) {
      const cache = await caches.open(DYNAMIC_CACHE);
      cache.put(request, networkResponse.clone());
    }
    return networkResponse;
  } catch (error) {
    const cachedResponse = await caches.match(request);
    if (cachedResponse) {
      return cachedResponse;
    }
    throw error;
  }
}

// Network-first with offline fallback
async function networkFirstWithFallback(request) {
  try {
    const networkResponse = await fetch(request);
    if (networkResponse.ok) {
      const cache = await caches.open(DYNAMIC_CACHE);
      cache.put(request, networkResponse.clone());
    }
    return networkResponse;
  } catch (error) {
    console.log('Network failed, trying cache...');
    const cachedResponse = await caches.match(request);
    if (cachedResponse) {
      return cachedResponse;
    }

    // Offline fallback for chat API
    if (request.url.includes('/chatbot') && request.method === 'POST') {
      return handleOfflineChat(request);
    }

    // Fallback to offline page for navigation
    if (request.mode === 'navigate') {
      const offlineResponse = await caches.match('/');
      if (offlineResponse) {
        return offlineResponse;
      }
    }

    return new Response('Offline - No cached content available', { 
      status: 503,
      statusText: 'Service Unavailable'
    });
  }
}

// Handle offline chat with simple AI responses
async function handleOfflineChat(request) {
  try {
    const body = await request.json();
    const message = body.message?.toLowerCase() || '';
    
    // Simple offline AI responses
    let reply = "Maaf, saya sedang offline. Namun saya bisa membantu dengan respon terbatas.";
    
    if (message.includes('halo') || message.includes('hai') || message.includes('hello')) {
      reply = "Halo! 👋 Saya Aurora AI. Saat ini dalam mode offline, tapi masih bisa berbincang sederhana dengan Anda.";
    } else if (message.includes('siapa') && message.includes('kamu')) {
      reply = "Saya Aurora AI, assistant virtual dengan tema langit aurora. Saat ini sedang offline tapi siap membantu! ✨";
    } else if (message.includes('terima kasih')) {
      reply = "Sama-sama! 😊 Senang bisa membantu meski dalam mode offline.";
    } else if (message.includes('apa kabar')) {
      reply = "Kabar baik! Meski sedang offline, semangat saya tetap menyala seperti aurora di langit! 🌌";
    } else if (message.includes('bantuan') || message.includes('help')) {
      reply = "Dalam mode offline, saya bisa:\n• Menjawab pertanyaan sederhana\n• Menyimpan chat history\n• Memberikan motivasi\n• Berbincang ringan\n\nUntuk fitur lengkap, harap sambungkan ke internet.";
    }

    return new Response(JSON.stringify({ reply }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json'
      }
    });
  } catch (error) {
    return new Response(JSON.stringify({ 
      reply: "Maaf, terjadi error dalam mode offline. Silakan coba lagi." 
    }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json'
      }
    });
  }
}

// Handle background sync for chat messages
self.addEventListener('sync', event => {
  if (event.tag === 'background-sync-chat') {
    event.waitUntil(syncChatMessages());
  }
});

// Sync chat messages when online
async function syncChatMessages() {
  try {
    // Get pending messages from IndexedDB
    const pendingMessages = await getPendingMessages();
    
    for (const message of pendingMessages) {
      try {
        const response = await fetch('/chatbot', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(message)
        });
        
        if (response.ok) {
          await markMessageAsSynced(message.id);
        }
      } catch (error) {
        console.error('Failed to sync message:', error);
      }
    }
  } catch (error) {
    console.error('Background sync failed:', error);
  }
}

// Helper functions for IndexedDB operations (will be implemented in main script)
async function getPendingMessages() {
  // This will be implemented in the main application
  return [];
}

async function markMessageAsSynced(messageId) {
  // This will be implemented in the main application
  return true;
}

// Handle push notifications (for future enhancement)
self.addEventListener('push', event => {
  if (event.data) {
    const data = event.data.json();
    const options = {
      body: data.body,
      icon: '/icons/icon-192x192.png',
      badge: '/icons/icon-72x72.png',
      vibrate: [100, 50, 100],
      data: {
        dateOfArrival: Date.now(),
        primaryKey: data.primaryKey
      },
      actions: [
        {
          action: 'explore',
          title: 'Open Chat',
          icon: '/icons/new-chat-96x96.png'
        },
        {
          action: 'close',
          title: 'Close',
          icon: '/icons/close-96x96.png'
        }
      ]
    };
    
    event.waitUntil(
      self.registration.showNotification(data.title, options)
    );
  }
});

// Handle notification clicks
self.addEventListener('notificationclick', event => {
  event.notification.close();
  
  if (event.action === 'explore') {
    event.waitUntil(
      clients.openWindow('/')
    );
  }
});
