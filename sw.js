// ─── Momentum PWA Service Worker ─────────────────────────────────────────────
const CACHE_NAME      = 'momentum-v3';
const DYNAMIC_CACHE   = 'momentum-dynamic-v3';
const BASE            = new URL('./', self.location.href).pathname; // e.g. /momentum-pwa/
const OFFLINE_URL     = BASE + 'offline.html';

// Files to pre-cache on install (app shell)
const PRECACHE_ASSETS = [
  BASE,
  BASE + 'index.html',
  BASE + 'offline.html',
  BASE + 'app.js',
  BASE + 'manifest.json',
  BASE + 'install.js',
  BASE + 'icons/icon-192.png',
  BASE + 'icons/icon-512.png',
  'https://fonts.googleapis.com/css2?family=Lora:ital,wght@0,400;0,600;0,700;1,400&family=DM+Sans:wght@300;400;500;600&display=swap',
  'https://unpkg.com/react@18/umd/react.production.min.js',
  'https://unpkg.com/react-dom@18/umd/react-dom.production.min.js',
  'https://unpkg.com/@babel/standalone/babel.min.js'
];

// ─── INSTALL: pre-cache app shell ────────────────────────────────────────────
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('[SW] Pre-caching app shell');
        // Cache what we can; don't fail install if some resources are unavailable
        return Promise.allSettled(
          PRECACHE_ASSETS.map(url =>
            cache.add(url).catch(err => console.warn('[SW] Failed to cache:', url, err))
          )
        );
      })
      .then(() => self.skipWaiting())
  );
});

// ─── ACTIVATE: clean old caches ──────────────────────────────────────────────
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys
          .filter(k => k !== CACHE_NAME && k !== DYNAMIC_CACHE)
          .map(k => { console.log('[SW] Deleting old cache:', k); return caches.delete(k); })
      ))
      .then(() => self.clients.claim())
  );
});

// ─── FETCH: cache-first for assets, network-first for API ────────────────────
self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET and chrome-extension requests
  if (request.method !== 'GET') return;
  if (url.protocol === 'chrome-extension:') return;

  // Network-first strategy for navigation requests
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then(response => {
          const clone = response.clone();
          caches.open(DYNAMIC_CACHE).then(cache => cache.put(request, clone));
          return response;
        })
        .catch(async () => {
          const cached = await caches.match(request);
          return cached || caches.match(OFFLINE_URL) || caches.match('/index.html');
        })
    );
    return;
  }

  // Cache-first strategy for static assets
  if (
    url.pathname.match(/\.(js|css|png|jpg|jpeg|svg|gif|ico|woff2?|ttf)$/) ||
    url.hostname === 'fonts.googleapis.com' ||
    url.hostname === 'fonts.gstatic.com' ||
    url.hostname === 'unpkg.com'
  ) {
    event.respondWith(
      caches.match(request).then(cached => {
        if (cached) return cached;
        return fetch(request).then(response => {
          if (!response || response.status !== 200) return response;
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(request, clone));
          return response;
        }).catch(() => caches.match(OFFLINE_URL));
      })
    );
    return;
  }

  // Stale-while-revalidate for everything else
  event.respondWith(
    caches.match(request).then(cached => {
      const fetchPromise = fetch(request).then(response => {
        if (response && response.status === 200) {
          const clone = response.clone();
          caches.open(DYNAMIC_CACHE).then(cache => cache.put(request, clone));
        }
        return response;
      }).catch(() => null);
      return cached || fetchPromise;
    })
  );
});

// ─── PUSH NOTIFICATIONS ───────────────────────────────────────────────────────
self.addEventListener('push', event => {
  let data = { title: 'Momentum', body: "Don't forget your habits today! 🔥", icon: BASE + 'icons/icon-192.png', badge: BASE + 'icons/icon-96.png', tag: 'momentum-reminder' };

  if (event.data) {
    try { Object.assign(data, event.data.json()); }
    catch { data.body = event.data.text(); }
  }

  event.waitUntil(
    self.registration.showNotification(data.title, {
      body:    data.body,
      icon:    data.icon,
      badge:   data.badge,
      tag:     data.tag,
      vibrate: [200, 100, 200],
      data:    { url: data.url || (BASE + '?view=today') },
      actions: [
        { action: 'open',    title: '✅ Check habits' },
        { action: 'dismiss', title: 'Later'           }
      ]
    })
  );
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  if (event.action === 'dismiss') return;

  const targetUrl = event.notification.data?.url || BASE;
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clientList => {
      for (const client of clientList) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          client.postMessage({ type: 'NAVIGATE', url: targetUrl });
          return client.focus();
        }
      }
      return clients.openWindow(targetUrl);
    })
  );
});

// ─── BACKGROUND SYNC — queue log updates when offline ────────────────────────
self.addEventListener('sync', event => {
  if (event.tag === 'sync-habits') {
    event.waitUntil(
      // In a real app: flush any offline queue to the server
      Promise.resolve().then(() => console.log('[SW] Background sync: habits'))
    );
  }
});

// ─── PERIODIC SYNC — daily reminder ──────────────────────────────────────────
self.addEventListener('periodicsync', event => {
  if (event.tag === 'daily-reminder') {
    event.waitUntil(
      self.registration.showNotification('Momentum', {
        body:  "Time to check your habits for today 🌿",
        icon:  BASE + 'icons/icon-192.png',
        badge: BASE + 'icons/icon-96.png',
        tag:   'daily-reminder',
        data:  { url: BASE + '?view=today' }
      })
    );
  }
});
