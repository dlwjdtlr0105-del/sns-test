/* Only a public offline screen is stored. Account data, API responses and
   user stories always go directly to the server and are never cached here. */
const OFFLINE_CACHE = 'sai-offline-v1';
const OFFLINE_URL = '/offline.html';

self.addEventListener('install', event => {
  event.waitUntil(caches.open(OFFLINE_CACHE).then(cache => cache.add(OFFLINE_URL)));
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(key => key.startsWith('sai-offline-') && key !== OFFLINE_CACHE).map(key => caches.delete(key)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== self.location.origin) return;
  if (url.pathname === '/api' || url.pathname.startsWith('/api/')) return;
  if (event.request.mode !== 'navigate') return;

  event.respondWith(fetch(event.request).catch(async () => {
    const fallback = await caches.match(OFFLINE_URL);
    return fallback || new Response('연결을 확인하고 다시 접속해 주세요.', {
      status: 503,
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    });
  }));
});
