const CACHE_NAME = 'halo-post-care-v6';
const APP_SHELL = [
  './',
  './index.html',
  './css/styles.css',
  './js/app.js',
  './js/assessment.js',
  './js/checkins.js',
  './js/checklist.js',
  './js/data.js',
  './js/day.js',
  './js/github.js',
  './js/photos.js',
  './js/progress.js',
  './js/storage.js',
  './js/ui/assessments.js',
  './js/ui/components.js',
  './js/ui/guide.js',
  './js/ui/log.js',
  './js/ui/progress.js',
  './js/ui/settings.js',
  './js/ui/today.js',
  './manifest.webmanifest',
  './icons/app-icon.svg'
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(
      keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
    ))
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin || event.request.method !== 'GET') return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);
    const cached = await cache.match(event.request);
    if (cached) {
      return cached;
    }

    try {
      const response = await fetch(event.request);
      if (response.ok) {
        await cache.put(event.request, response.clone());
      }
      return response;
    } catch (error) {
      if (event.request.mode === 'navigate') {
        const shell = await cache.match('./index.html');
        if (shell) {
          return shell;
        }
      }
      throw error;
    }
  })());
});
