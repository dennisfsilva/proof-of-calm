// The service worker (ADR-0033; ADR-0045 §5), bundled by scripts/bundle-worker.ts after the pages exist
// and type-checked with the webworker library (tsconfig.sw.json). It precaches the app shell, the offline
// page, the hashed assets, the icons and the manifest; answers every product route from the shell online
// and offline; keeps the last prices for a cold start offline (the "prices from" line itself comes from
// IndexedDB, not from here); and serves the offline page to a document it cannot answer. A new version
// waits until the app asks it to take over (skipWaiting false; the app's registration posts SKIP_WAITING
// on accept, packages/app/src/lib/pwa/register.ts).
import {
  CacheFirst,
  ExpirationPlugin,
  NetworkFirst,
  type PrecacheEntry,
  Serwist,
  type SerwistGlobalConfig,
  StaleWhileRevalidate,
} from 'serwist';
import { stampCopy } from './prices-copy';
import { PUBLIC_PAGES, shellRoutes } from './shell-navigation';

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    // Replaced by the precache manifest when injectManifest writes dist/sw.js.
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}

declare const self: ServiceWorkerGlobalScope;
// The product's routes (packages/app/src/lib/navigation/routes.ts), defined at bundle time.
declare const __APP_ROUTES__: readonly string[];

const DAY = 24 * 60 * 60;
const PAGES = 'pages';

function withoutFragment(href: string): string {
  const url = new URL(href);
  url.hash = '';
  return url.href;
}

const serwist = new Serwist({
  // Undefined in development, where nothing is precached.
  precacheEntries: self.__SW_MANIFEST ?? [],
  precacheOptions: {
    cleanupOutdatedCaches: true,
    // Every product route is the precached shell, as vercel.json rewrites it online (ADR-0045 §1).
    navigateFallback: '/app',
    navigateFallbackAllowlist: [shellRoutes(__APP_ROUTES__)],
    // A public page under /en/ is a file of its own, never the shell (shell-navigation.test.ts).
    navigateFallbackDenylist: [PUBLIC_PAGES],
  },
  skipWaiting: false,
  clientsClaim: true,
  navigationPreload: true,
  runtimeCaching: [
    {
      matcher: ({ sameOrigin, url }) => sameOrigin && url.pathname === '/api/prices',
      method: 'GET',
      handler: new StaleWhileRevalidate({
        cacheName: 'prices',
        plugins: [
          // Stamps the kept copy with its fetch time, which the page reads when this copy is replayed.
          { cacheWillUpdate: async ({ response }) => stampCopy(response, new Date()) },
          new ExpirationPlugin({ maxEntries: 8, maxAgeSeconds: DAY }),
        ],
      }),
    },
    {
      // The site pages and anything else that is a document: the network, the cache when it is away.
      matcher: ({ sameOrigin, request }) => sameOrigin && request.destination === 'document',
      handler: new NetworkFirst({
        cacheName: PAGES,
        networkTimeoutSeconds: 10,
        plugins: [
          // The holding-date tool's inputs live in the fragment, which the request's URL keeps: the copy is kept
          // under the page's own URL, so no purchase date is stored and every fragment opens the same copy.
          { cacheKeyWillBeUsed: async ({ request }) => withoutFragment(request.url) },
          new ExpirationPlugin({ maxEntries: 32, maxAgeSeconds: 7 * DAY }),
        ],
      }),
    },
    {
      // Hashed assets (the site pages' islands among them, which the precache leaves out) a lazy screen loads after the precache ran (the precached ones never reach here).
      matcher: ({ sameOrigin, url }) => sameOrigin && url.pathname.startsWith('/assets/'),
      handler: new CacheFirst({
        cacheName: 'assets',
        plugins: [new ExpirationPlugin({ maxEntries: 64, maxAgeSeconds: 30 * DAY })],
      }),
    },
  ],
  fallbacks: {
    entries: [{ url: '/~offline', matcher: ({ request }) => request.destination === 'document' }],
  },
});

serwist.addEventListeners();

// A worker built before the `pages` route dropped the fragment kept a navigation under its full URL, purchase date
// included, and nothing else removes that key (WebKit even keeps it on a later put of the bare page): the activating
// worker deletes every `pages` key with a fragment, by its stored request, and leaves the rest of the cache alone.
self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      if (!(await caches.has(PAGES))) return;
      const pages = await caches.open(PAGES);
      for (const request of await pages.keys()) if (request.url.includes('#')) await pages.delete(request);
    })(),
  );
});
