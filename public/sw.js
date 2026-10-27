/* Headliners service worker: makes the game load and play offline after the first visit (SPEC S0.1).
 *
 * - Page loads: network first, so a new deploy shows up as soon as you're online; cached copy when offline.
 * - Built assets (hashed file names): cache first, they never change.
 * - Fonts are self-hosted (public/fonts), so they're cached like any other asset.
 */
const CACHE = 'headliners-v32';
const CORE = ['./', './manifest.webmanifest', './icons/icon-192.png', './icons/apple-touch-icon.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(CORE))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);

  if (request.mode === 'navigate') {
    event.respondWith(networkFirst(request, './'));
    return;
  }

  if (url.origin === self.location.origin) {
    event.respondWith(cacheFirst(request));
    return;
  }
});

async function networkFirst(request, fallbackKey) {
  const cache = await caches.open(CACHE);
  try {
    const response = await fetch(request);
    if (response.ok) cache.put(fallbackKey, response.clone());
    return response;
  } catch {
    return (await cache.match(fallbackKey)) || Response.error();
  }
}

async function cacheFirst(request) {
  const cache = await caches.open(CACHE);
  const cached = await cache.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok) cache.put(request, response.clone());
  return response;
}
