// Service worker — companion PWA per il dietista (agenda/chat/pazienti offline-first).
// Niente build step in questo repo: Workbox è caricato via CDN (stesso pattern già
// usato per Supabase-js in tutte le pagine), non serve un bundler/injectManifest.
importScripts('https://storage.googleapis.com/workbox-cdn/releases/7.1.0/workbox-sw.js');

const VERSION = 'v2';

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', event => {
  event.waitUntil(self.clients.claim());
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
