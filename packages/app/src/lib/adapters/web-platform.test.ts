import { describe, expect, it, vi } from 'vitest';
import { noAnalytics, webPlatform } from './web-platform';

function fakeBrowser(navigator: Partial<Navigator> & { standalone?: boolean }, standalone = false) {
  const link = { href: '', download: '', click: vi.fn(), remove: vi.fn() };
  const append = vi.fn();
  const timers: (() => void)[] = [];
  const browser = {
    navigator: navigator as Navigator,
    document: { createElement: () => link, body: { append }, querySelectorAll: () => [] } as unknown as Document,
    URL: { createObjectURL: vi.fn(() => 'blob:export'), revokeObjectURL: vi.fn() },
    fetch: vi.fn(async () => undefined),
    setTimeout: (run: () => void) => timers.push(run),
    location: { reload: vi.fn() },
    matchMedia: (query: string) => ({ matches: standalone && query === '(display-mode: standalone)' }),
  };
  return { browser, link, append, timers };
}

describe('webPlatform (ADR-0032)', () => {
  it('shares through the Web Share API, and says false without one or when cancelled', async () => {
    const share = vi.fn(async () => undefined);
    expect(await webPlatform(fakeBrowser({ share }).browser).share({ title: 'Plan' })).toBe(true);
    expect(share).toHaveBeenCalledWith({ title: 'Plan' });
    expect(await webPlatform(fakeBrowser({}).browser).share({ title: 'Plan' })).toBe(false);
    const cancelled = vi.fn(async () => Promise.reject(new DOMException('cancelled', 'AbortError')));
    expect(await webPlatform(fakeBrowser({ share: cancelled }).browser).share({ title: 'Plan' })).toBe(false);
  });

  it('downloads through an object URL it revokes later', async () => {
    const { browser, link, append, timers } = fakeBrowser({});
    expect(await webPlatform(browser).download('proof-of-calm-log-2026-10-17.csv', 'date', 'text/csv')).toBe(true);
    expect([link.href, link.download]).toEqual(['blob:export', 'proof-of-calm-log-2026-10-17.csv']);
    expect(append).toHaveBeenCalledWith(link);
    expect(link.click).toHaveBeenCalled();
    expect(link.remove).toHaveBeenCalled();
    for (const run of timers) run();
    expect(browser.URL.revokeObjectURL).toHaveBeenCalledWith('blob:export');
  });

  it('asks for persistent storage once, where the Storage API exists', async () => {
    const persist = vi.fn(async () => true);
    const fresh = { storage: { persisted: async () => false, persist } as unknown as StorageManager };
    expect(await webPlatform(fakeBrowser(fresh).browser).persistStorage()).toBe(true);
    const already = { storage: { persisted: async () => true, persist } as unknown as StorageManager };
    expect(await webPlatform(fakeBrowser(already).browser).persistStorage()).toBe(true);
    expect(persist).toHaveBeenCalledTimes(1);
    expect(await webPlatform(fakeBrowser({}).browser).persistStorage()).toBe(false);
    expect(webPlatform(fakeBrowser({}).browser).native).toBe(false);
  });

  it('reloads the page through the location', async () => {
    const { browser } = fakeBrowser({});
    webPlatform(browser).reload();
    await vi.waitFor(() => expect(browser.location.reload).toHaveBeenCalledTimes(1));
  });

  it('asks for every module preload again before it reloads, as WebKit reuses a failed one (ADR-0045)', async () => {
    const { browser } = fakeBrowser({});
    const hrefs = ['/assets/portfolio-a.js', '/assets/lots-b.js'];
    const document = { querySelectorAll: () => hrefs.map((href) => ({ href })) } as unknown as Document;
    const answers: (() => void)[] = [];
    const fetch = vi.fn((_url: string, _init: RequestInit) => new Promise<void>((resolve) => answers.push(resolve)));
    webPlatform({ ...browser, document, fetch }).reload();
    expect(fetch.mock.calls).toEqual(hrefs.map((href) => [href, { cache: 'no-cache' }]));
    answers[0]?.();
    await Promise.resolve();
    expect(browser.location.reload).not.toHaveBeenCalled();
    answers[1]?.();
    await vi.waitFor(() => expect(browser.location.reload).toHaveBeenCalledTimes(1));
  });

  it('reloads when a preload cannot be asked for again, offline or after 3 seconds', async () => {
    const { browser } = fakeBrowser({});
    const document = { querySelectorAll: () => [{ href: '/assets/a.js' }] } as unknown as Document;
    const offline = vi.fn(async () => Promise.reject(new TypeError('Load failed')));
    webPlatform({ ...browser, document, fetch: offline }).reload();
    await vi.waitFor(() => expect(browser.location.reload).toHaveBeenCalledTimes(1));

    const slow = fakeBrowser({});
    const hanging = vi.fn(async () => new Promise<void>(() => undefined));
    webPlatform({ ...slow.browser, document, fetch: hanging }).reload();
    await Promise.resolve();
    expect(slow.browser.location.reload).not.toHaveBeenCalled();
    for (const run of slow.timers) run();
    await vi.waitFor(() => expect(slow.browser.location.reload).toHaveBeenCalledTimes(1));
  });

  it("reads the installed app from the standalone display mode, or from iOS Safari's navigator.standalone", () => {
    expect(webPlatform(fakeBrowser({}).browser).installed()).toBe(false);
    expect(webPlatform(fakeBrowser({}, true).browser).installed()).toBe(true);
    expect(webPlatform(fakeBrowser({ standalone: true }).browser).installed()).toBe(true);
  });

  it('counts nothing until the counting endpoint exists (ADR-0028)', () => {
    expect(noAnalytics.count('entry_logged')).toBeUndefined();
  });
});
