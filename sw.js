// Service worker — companion PWA per il dietista (agenda/chat/pazienti offline-first).
// Niente build step in questo repo: Workbox è caricato via CDN (stesso pattern già
// usato per Supabase-js in tutte le pagine), non serve un bundler/injectManifest.
importScripts('https://storage.googleapis.com/workbox-cdn/releases/7.1.0/workbox-sw.js');

const VERSION = 'v8';

// File pesanti condivisi da (quasi) tutte le pagine cliniche (app/database/
// patologie/ricette/valutazione per db.min.js, praticamente tutto il sito per
// lang.min.js) — precachati subito all'installazione della PWA invece di
// aspettare che ogni singola pagina li richieda per la prima volta, così un
// dietista che apre "Database Alimenti" per la prima volta li trova già in
// cache invece di scaricarli lì su una connessione lenta. Vanno nello stesso
// bucket 'assets-VERSION' usato dalla CacheFirst qui sotto, cosí il cache
// hit funziona a runtime senza duplicare la logica di caching.
const PRECACHE_URLS = ['/js/db.min.js', '/js/lang.min.js'];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open('assets-' + VERSION).then(cache => cache.addAll(PRECACHE_URLS)),
  );
  self.skipWaiting();
});
self.addEventListener('activate', event => {
  event.waitUntil(
    Promise.all([
      self.clients.claim(),
      // Rimuove i bucket delle versioni precedenti (pages-v2, assets-v2, ...)
      // per non far crescere indefinitamente lo storage occupato dalla SW —
      // rilevante sui device con poco spazio disco che questo lavoro vuole
      // supportare meglio. Le cache dei font Google non hanno suffisso
      // versione (durano già un anno di loro) e restano escluse apposta.
      caches.keys().then(keys =>
        Promise.all(
          keys
            .filter(key => /-v\d+$/.test(key) && !key.endsWith('-' + VERSION))
            .map(key => caches.delete(key)),
        ),
      ),
    ]),
  );
});

if (!workbox) {
  console.error('[sw] Workbox non caricato — nessun caching offline attivo.');
} else {
  workbox.setConfig({ debug: false });
  const { registerRoute } = workbox.routing;
  const { NetworkFirst, CacheFirst, StaleWhileRevalidate } = workbox.strategies;
  const { ExpirationPlugin } = workbox.expiration;

  // Pagine HTML: network-first così online si vede sempre il contenuto fresco
  // (queste pagine sono dinamiche, Cache-Control:no-store lato HTTP) — offline
  // mostra l'ultima versione vista, invece del "sei offline" del browser.
  registerRoute(
    ({ request }) => request.mode === 'navigate',
    new NetworkFirst({
      cacheName: 'pages-' + VERSION,
      networkTimeoutSeconds: 6,
      plugins: [new ExpirationPlugin({ maxEntries: 50, maxAgeSeconds: 60 * 60 * 24 * 7 })],
    }),
  );

  // JS/CSS: già cacheati 7gg lato HTTP (vercel.json) — cache-first qui li rende
  // disponibili anche offline, non solo "veloci".
  registerRoute(
    ({ request }) => request.destination === 'script' || request.destination === 'style',
    new CacheFirst({
      cacheName: 'assets-' + VERSION,
      plugins: [new ExpirationPlugin({ maxEntries: 80, maxAgeSeconds: 60 * 60 * 24 * 30 })],
    }),
  );

  registerRoute(
    ({ request }) => request.destination === 'image',
    new CacheFirst({
      cacheName: 'images-' + VERSION,
      plugins: [new ExpirationPlugin({ maxEntries: 100, maxAgeSeconds: 60 * 60 * 24 * 30 })],
    }),
  );

  // Supabase: network-first con timeout breve — offline mostra l'ultima
  // risposta cachata invece di far restare la UI in caricamento infinito.
  registerRoute(
    ({ url }) => url.hostname.includes('supabase.co'),
    new NetworkFirst({
      cacheName: 'supabase-' + VERSION,
      networkTimeoutSeconds: 8,
      plugins: [new ExpirationPlugin({ maxEntries: 60, maxAgeSeconds: 60 * 60 * 6 })],
    }),
  );

  registerRoute(
    ({ url }) => url.hostname === 'fonts.googleapis.com',
    new StaleWhileRevalidate({ cacheName: 'google-fonts-css' }),
  );
  registerRoute(
    ({ url }) => url.hostname === 'fonts.gstatic.com',
    new CacheFirst({
      cacheName: 'google-fonts-webfonts',
      plugins: [new ExpirationPlugin({ maxEntries: 10, maxAgeSeconds: 60 * 60 * 24 * 365 })],
    }),
  );
}

// Promemoria appuntamenti (api/cron-appointment-reminders.js) e altre
// notifiche future al dietista — vedi SEZIONE 24 di supabase_setup.sql.
self.addEventListener('push', event => {
  let data = {};
  try { if (event.data) data = event.data.json(); } catch {}
  event.waitUntil(
    self.registration.showNotification(data.title || 'DietPlan Pro', {
      body: data.body || '',
      icon: '/icons/icon-192x192.png',
      badge: '/icons/icon-96x96.png',
      data: { url: data.url || '/agenda.html' },
    }),
  );
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  const url = event.notification.data?.url || '/agenda.html';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clientList => {
      for (const client of clientList) {
        if (client.url.includes(url) && 'focus' in client) return client.focus();
      }
      if (self.clients.openWindow) return self.clients.openWindow(url);
    }),
  );
});
