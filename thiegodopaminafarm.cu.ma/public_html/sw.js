/* ============================================================
   THIEGO DOPAMINA FARM — Service Worker
   Cache estático + offline + push notifications
   ============================================================ */
const CACHE = 'tdf-v5-temas-cos';
const ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/vendor/bootstrap/css/bootstrap.min.css',
  '/vendor/bootstrap/js/bootstrap.bundle.min.js',
  '/css/main.css',
  '/css/game.css',
  '/css/ui.css',
  '/css/animations.css',
  '/css/responsive.css',
  '/css/expansion.css',
  '/css/identity.css',
  '/css/theme.css',
  '/js/numbers.js',
  '/js/data.js',
  '/js/state.js',
  '/js/economy.js',
  '/js/game.js',
  '/js/minigames.js',
  '/js/content.js',
  '/js/antiCheat.js',
  '/js/leaderboard.js',
  '/js/net.js',
  '/js/expansion.js',
  '/js/audio.js',
  '/js/fx.js',
  '/js/ui.js',
  '/js/main.js',
  '/js/db.js',
  '/js/wasm.js',
  '/js/background3d.js',
  '/js/realtime.js',
  '/js/chat.js',
  '/js/boss.js',
  '/js/ai.js',
  '/js/pwa.js',
];

/* ---------- instalacao ---------- */
self.addEventListener('install', function (e) {
  e.waitUntil(
    caches.open(CACHE).then(function (cache) {
      return cache.addAll(ASSETS);
    }).then(function () {
      return self.skipWaiting();
    })
  );
});

/* ---------- ativacao: limpa caches antigos ---------- */
self.addEventListener('activate', function (e) {
  e.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(
        keys.filter(function (k) { return k !== CACHE; })
          .map(function (k) { return caches.delete(k); })
      );
    }).then(function () {
      return self.clients.claim();
    })
  );
});

/* ---------- interceptacao: network-first com fallback ao cache ---------- */
self.addEventListener('fetch', function (e) {
  const url = new URL(e.request.url);

  // API: sempre da rede (com fallback)
  if (url.pathname.startsWith('/api/')) {
    e.respondWith(
      fetch(e.request).catch(function () {
        return caches.match(e.request);
      })
    );
    return;
  }

  // Assets estaticos: cache-first
  e.respondWith(
    caches.match(e.request).then(function (hit) {
      return hit || fetch(e.request).then(function (res) {
        return caches.open(CACHE).then(function (cache) {
          cache.put(e.request, res.clone());
          return res;
        });
      });
    }).catch(function () {
      // offline: tenta index.html (SPA)
      if (e.request.mode === 'navigate') {
        return caches.match('/');
      }
      return new Response('Offline', { status: 503 });
    })
  );
});

/* ---------- push notifications ---------- */
self.addEventListener('push', function (e) {
  if (!e.data) return;
  try {
    var data = e.data.json();
    var title = data.title || 'THIEGO DOPAMINA FARM';
    var opts = {
      body: data.body || '',
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
      vibrate: data.vibrate || [200, 100, 200],
      data: data.data || {},
      requireInteraction: !!data.persistent,
    };
    e.waitUntil(self.registration.showNotification(title, opts));
  } catch (err) {
    // fallback para texto simples
    e.waitUntil(self.registration.showNotification('THIEGO DOPAMINA FARM', {
      body: e.data.text(),
      icon: '/icons/icon-192.png',
    }));
  }
});

self.addEventListener('notificationclick', function (e) {
  e.notification.close();
  var url = e.notification.data && e.notification.data.url;
  if (url) {
    e.waitUntil(clients.openWindow(url));
  } else {
    e.waitUntil(clients.matchAll({ type: 'window' }).then(function (cs) {
      if (cs.length) { cs[0].focus(); }
      else { clients.openWindow('/'); }
    }));
  }
});