import type { CDPSession, Page } from '@playwright/test';

// What `navigator.onLine` says on a Chromium page: what the spec sets, not what the host has. Chromium
// follows the host's network adapter, and the app reads that as the platform reporting no network
// (ADR-0033, "What the line says"), so on 2026-10-27 a laptop whose Wi-Fi dropped twice during a local
// gate showed "offline" on every cold boot of /today although the spec's route answered every request.
// Playwright cannot pin it: `setOffline(true)` overrides the state and `setOffline(false)` hands it back
// to the host. CDP's `Network.overrideNetworkState` sets it; an upload throughput of 0 or more keeps the
// override active (all of latency 0 and throughputs -1 would clear it instead), it states nothing a
// request obeys, and the page keeps it through reloads and navigations. Call it again after every
// `setOffline`, whose own override replaces it. Chromium only, as `newCDPSession` is.

const sessions = new WeakMap<Page, CDPSession>();

/** Pins the page's `navigator.onLine` to `online`, whatever the host's network does. */
export async function pinNetwork(page: Page, online: boolean): Promise<void> {
  let session = sessions.get(page);
  if (session === undefined) {
    session = await page.context().newCDPSession(page);
    sessions.set(page, session);
  }
  await session.send('Network.overrideNetworkState', {
    offline: !online,
    latency: 0,
    downloadThroughput: -1,
    uploadThroughput: 0,
  });
}
