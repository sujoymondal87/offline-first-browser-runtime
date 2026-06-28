import { precacheAndRoute, cleanupOutdatedCaches } from 'workbox-precaching';
import { NavigationRoute, registerRoute } from 'workbox-routing';
import { NetworkFirst, CacheFirst } from 'workbox-strategies';

const CACHE_NAME = 'offline-guide-v3';

// Precache all build assets (hashed filenames injected at build time)
precacheAndRoute(self.__WB_MANIFEST);
cleanupOutdatedCaches();

// Navigation: network-first, fall back to cached index.html
registerRoute(
  new NavigationRoute(
    new NetworkFirst({
      cacheName: CACHE_NAME,
      networkTimeoutSeconds: 3,
    })
  )
);

// Static assets: cache-first
registerRoute(
  ({ request }) => ['script', 'style', 'image', 'font'].includes(request.destination),
  new CacheFirst({ cacheName: CACHE_NAME })
);

// Never intercept API calls
registerRoute(
  ({ url }) => url.pathname.startsWith('/api/'),
  ({ request }) => fetch(request)
);

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
});
