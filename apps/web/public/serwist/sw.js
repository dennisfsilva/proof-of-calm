// The kill switch for M0's worker at /serwist/sw.js (ADR-0045 §5). An installed M0 worker checks this
// URL for updates; a 404 would leave it serving Next's cached pages. This worker takes over at once
// (the M0 worker has skipWaiting false and would otherwise keep it waiting until every tab closes),
// deletes every cache, unregisters itself and reloads each open page, which then loads the new app and
// registers /sw.js. It stays until launch; docs/RELEASE.md lists its removal.
self.addEventListener('install', () => {
  void self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      await Promise.all(names.map((name) => caches.delete(name)));
      await self.registration.unregister();
      const clients = await self.clients.matchAll({ type: 'window' });
      await Promise.all(clients.map((client) => client.navigate(client.url)));
    })(),
  );
});
