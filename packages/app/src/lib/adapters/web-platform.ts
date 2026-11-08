// The browser's Platform (ADR-0032): the Web Share API, a download through an object URL, the Storage
// API's persistence request, a reload of the page and whether it runs as the installed app. The native wrapper brings its own adapter in M3.
import type { Analytics, Platform } from '../ports';

type Browser = {
  readonly navigator: Navigator;
  readonly document: Document;
  readonly URL: Pick<typeof URL, 'createObjectURL' | 'revokeObjectURL'>;
  readonly setTimeout: (run: () => void, ms: number) => unknown;
  readonly location: Pick<Location, 'reload'>;
  readonly fetch: (url: string, init: RequestInit) => Promise<unknown>;
  readonly matchMedia: (query: string) => { readonly matches: boolean };
};

const browserGlobals = (): Browser => ({
  navigator,
  document,
  URL,
  setTimeout: (run, ms) => setTimeout(run, ms),
  location: window.location,
  fetch: (url, init) => fetch(url, init),
  matchMedia: (query) => window.matchMedia(query),
});

export function webPlatform(browser: Browser = browserGlobals()): Platform {
  return {
    native: false,
    async share(data) {
      if (typeof browser.navigator.share !== 'function') return false;
      try {
        await browser.navigator.share(data);
        return true;
      } catch {
        return false;
      }
    },
    async download(name, content, type) {
      const url = browser.URL.createObjectURL(new Blob([content], { type }));
      const link = browser.document.createElement('a');
      link.href = url;
      link.download = name;
      browser.document.body.append(link);
      link.click();
      link.remove();
      browser.setTimeout(() => browser.URL.revokeObjectURL(url), 5000);
      return true;
    },
    async persistStorage() {
      const storage = browser.navigator.storage;
      if (storage === undefined || typeof storage.persist !== 'function') return false;
      return (await storage.persisted()) || storage.persist();
    },
    reload() {
      // WebKit keeps a module preload that failed in its memory cache, and the reloaded page takes it
      // from there without asking the network (ADR-0045, Deviations 2026-10-26). Asking for each preload
      // again with `no-cache` drops that copy; offline or slow, the page reloads all the same.
      const links = browser.document.querySelectorAll<HTMLLinkElement>('link[rel="modulepreload"]');
      const asked = Promise.allSettled([...links].map(({ href }) => browser.fetch(href, { cache: 'no-cache' })));
      const cap = new Promise<void>((resolve) => browser.setTimeout(resolve, 3000));
      void Promise.race([asked, cap]).then(() => browser.location.reload());
    },
    installed() {
      // The manifest's display mode; iOS Safari's home-screen app reports it only on navigator.standalone.
      const ios = (browser.navigator as Navigator & { readonly standalone?: boolean }).standalone === true;
      return ios || browser.matchMedia('(display-mode: standalone)').matches;
    },
  };
}

/** Counting is server-side (ADR-0028); until its endpoint exists, nothing is sent. */
export const noAnalytics: Analytics = { count: () => undefined };
