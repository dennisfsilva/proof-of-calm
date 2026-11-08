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
const appRoute = new RegExp(`^/(?:${__APP_ROUTES__.join('|')})(?:[/?]|$)`);

const serwist = new Serwist({
  // Undefined in development, where nothing is precached.
  precacheEntries: self.__SW_MANIFEST ?? [],
  precacheOptions: {
    cleanupOutdatedCaches: true,
    // Every product route is the precached shell, as vercel.json rewrites it online (ADR-0045 §1).
    navigateFallback: '/app',
    navigateFallbackAllowlist: [appRoute],
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
        cacheName: 'pages',
        networkTimeoutSeconds: 10,
        plugins: [new ExpirationPlugin({ maxEntries: 32, maxAgeSeconds: 7 * DAY })],
      }),
    },
    {
      // Hashed assets a lazy screen loads after the precache ran (the precached ones never reach here).
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
