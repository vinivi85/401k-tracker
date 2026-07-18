const CACHE_NAME = '401k-tracker-v76';
const APP_VERSION = 'v76';
const BUILD_DATE = '2026-07-17 22:05 CDT';

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'GET_VERSION') {
    event.ports[0].postMessage({ version: APP_VERSION, buildDate: BUILD_DATE, cacheName: CACHE_NAME });
  }
});
const ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './core.js',
  './supabase-client.js',
  './auth-screen.js',
  './lock-screen.js',
  './tab-tracker.js',
  './tab-paycheck.js',
  './tab-pay.js',
  './tab-projection.js',
  './tab-config.js',
  './app.js',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS)).catch(() => {})
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Network-first: sempre tenta buscar a versão mais nova da rede.
// Só usa o cache como fallback se estiver offline.
// Isso evita o app ficar "preso" numa versão antiga durante desenvolvimento ativo.
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        if (response && response.status === 200 && response.type === 'basic') {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        }
        return response;
      })
      .catch(() => caches.match(event.request))
  );
});
