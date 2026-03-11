const CACHE_VERSION = 'aiflex-erp-v4';
const APP_SHELL_CACHE = `app-shell-${CACHE_VERSION}`;
const IS_DEV_SERVER =
  self.location.port === '3000' ||
  self.location.hostname === 'localhost' ||
  self.location.hostname === '127.0.0.1';
const APP_SHELL_URLS = [
  '/',
  '/index.html',
  '/index.css',
  '/manifest.webmanifest',
  '/manifest.webmanifest?v=20260311-icons-v2',
  '/brand/aiflex-erp-logo.svg',
  '/brand/aiflex-erp-mark.svg',
  '/icons/favicon-32.png',
  '/icons/favicon-32.png?v=20260311-icons-v2',
  '/icons/apple-touch-icon.png',
  '/icons/apple-touch-icon.png?v=20260311-icons-v2',
  '/icons/icon-192.png',
  '/icons/icon-192.png?v=20260311-icons-v2',
  '/icons/icon-512.png',
  '/icons/icon-512.png?v=20260311-icons-v2',
  '/icons/icon-192.webp',
  '/icons/icon-512.webp',
  '/icons/icon-192.svg',
  '/icons/icon-512.svg'
];

const STATIC_DESTINATIONS = new Set(['document', 'script', 'style', 'image', 'font', 'manifest', 'worker']);

const isCacheableResponse = (response) => Boolean(response) && (response.ok || response.type === 'opaque');

const shouldHandleRequest = (request) => {
  if (request.method !== 'GET') return false;

  const url = new URL(request.url);
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return false;

  if (url.hostname.endsWith('supabase.co')) return false;

  return request.mode === 'navigate' || STATIC_DESTINATIONS.has(request.destination);
};

const putInCache = async (request, response) => {
  if (!isCacheableResponse(response)) return response;
  const cache = await caches.open(APP_SHELL_CACHE);
  await cache.put(request, response.clone());
  return response;
};

self.addEventListener('install', (event) => {
  if (IS_DEV_SERVER) {
    event.waitUntil(self.skipWaiting());
    return;
  }

  event.waitUntil((async () => {
    const cache = await caches.open(APP_SHELL_CACHE);
    await Promise.allSettled(APP_SHELL_URLS.map(async (url) => {
      const response = await fetch(url, { cache: 'reload' });
      if (isCacheableResponse(response)) {
        await cache.put(url, response);
      }
    }));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    if (IS_DEV_SERVER) {
      const keys = await caches.keys();
      await Promise.all(keys.map((key) => caches.delete(key)));
      await self.clients.claim();
      return;
    }

    const keys = await caches.keys();
    await Promise.all(keys.map((key) => {
      if (key !== APP_SHELL_CACHE) {
        return caches.delete(key);
      }
      return Promise.resolve(false);
    }));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  if (IS_DEV_SERVER) return;
  if (!shouldHandleRequest(event.request)) return;

  event.respondWith((async () => {
    if (event.request.mode === 'navigate') {
      try {
        const networkResponse = await fetch(event.request);
        return putInCache(event.request, networkResponse);
      } catch {
        const cachedResponse = await caches.match(event.request);
        if (cachedResponse) return cachedResponse;
        return (await caches.match('/')) || (await caches.match('/index.html'));
      }
    }

    const cachedResponse = await caches.match(event.request);
    const networkPromise = fetch(event.request)
      .then((response) => putInCache(event.request, response))
      .catch(() => undefined);

    if (cachedResponse) {
      void networkPromise;
      return cachedResponse;
    }

    const networkResponse = await networkPromise;
    if (networkResponse) return networkResponse;

    if (event.request.destination === 'image') {
      return caches.match('/icons/icon-192.png');
    }

    throw new Error('Offline and no cached asset available.');
  })());
});
