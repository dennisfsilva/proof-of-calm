import { describe, expect, it } from 'vitest';
import { CHUNK_RELOAD_KEY, type ChunkReloadOptions, installChunkReload } from './chunk-reload';

const ENTRY = 'https://example.test/assets/app-abc123.js';

/** A fetch whose answer the test settles by hand, recording every call. */
function heldFetch() {
  const calls: { url: string; init: RequestInit }[] = [];
  const pending: { resolve: (r: { status: number }) => void; reject: (e: unknown) => void }[] = [];
  const fetch: ChunkReloadOptions['fetch'] = (url, init) => {
    calls.push({ url, init });
    return new Promise((resolve, reject) => pending.push({ resolve, reject }));
  };
  return {
    fetch,
    calls,
    answer: (status: number) => pending.shift()?.resolve({ status }),
    fail: () => pending.shift()?.reject(new TypeError('Load failed')),
  };
}

function setup(options: { readonly storage?: ChunkReloadOptions['storage']; readonly stored?: string } = {}) {
  const target = new EventTarget();
  const store = new Map<string, string>(options.stored === undefined ? [] : [[CHUNK_RELOAD_KEY, options.stored]]);
  const held = heldFetch();
  let reloads = 0;
  installChunkReload({
    target,
    entryUrl: ENTRY,
    fetch: held.fetch,
    storage:
      options.storage ??
      (() => ({
        getItem: (key) => store.get(key) ?? null,
        setItem: (key, value) => void store.set(key, value),
      })),
    reload: () => {
      reloads += 1;
    },
  });
  const dispatch = () => {
    const event = new Event('vite:preloadError', { cancelable: true });
    target.dispatchEvent(event);
    return event;
  };
  return { dispatch, held, store, reloads: () => reloads };
}

/** Lets the handler's awaits run after a settled fetch. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('installChunkReload', () => {
  it('prevents the default of the event, so Vite does not throw the error', () => {
    const { dispatch } = setup();
    expect(dispatch().defaultPrevented).toBe(true);
  });

  it('keeps the page while the running entry is still deployed (a chunk cancelled while leaving)', async () => {
    const { dispatch, held, store, reloads } = setup();
    dispatch();
    expect(held.calls).toEqual([{ url: ENTRY, init: { method: 'HEAD', cache: 'no-store' } }]);
    held.answer(200);
    await settle();
    expect(reloads()).toBe(0);
    expect(store.has(CHUNK_RELOAD_KEY)).toBe(false);
  });

  it('reloads once and keeps the key when the running entry answers 404', async () => {
    const { dispatch, held, store, reloads } = setup();
    dispatch();
    held.answer(404);
    await settle();
    expect(reloads()).toBe(1);
    expect(store.get(CHUNK_RELOAD_KEY)).toBe('1');
  });

  it('reloads when the running entry answers 410', async () => {
    const { dispatch, held, reloads } = setup();
    dispatch();
    held.answer(410);
    await settle();
    expect(reloads()).toBe(1);
  });

  it('keeps the page when the check itself fails', async () => {
    const { dispatch, held, reloads } = setup();
    dispatch();
    held.fail();
    await settle();
    expect(reloads()).toBe(0);
  });

  it('neither checks nor reloads after a reload this session already made', async () => {
    const { dispatch, held, reloads } = setup({ stored: '1' });
    dispatch();
    await settle();
    expect(held.calls).toHaveLength(0);
    expect(reloads()).toBe(0);
  });

  it('runs one check at a time and stops checking once it reloaded', async () => {
    const { dispatch, held, reloads } = setup();
    dispatch();
    dispatch();
    expect(held.calls).toHaveLength(1);
    held.answer(404);
    await settle();
    dispatch();
    await settle();
    expect(held.calls).toHaveLength(1);
    expect(reloads()).toBe(1);
  });

  it('checks again after a check that found the build deployed, and reloads once it is gone', async () => {
    const { dispatch, held, reloads } = setup();
    dispatch();
    held.answer(200);
    await settle();
    dispatch();
    expect(held.calls).toHaveLength(2);
    held.answer(404);
    await settle();
    expect(reloads()).toBe(1);
  });

  it('checks again after a check that failed, and reloads once the build is gone', async () => {
    const { dispatch, held, reloads } = setup();
    dispatch();
    held.fail();
    await settle();
    dispatch();
    expect(held.calls).toHaveLength(2);
    held.answer(404);
    await settle();
    expect(reloads()).toBe(1);
  });

  it('still reloads once on 404 when the storage throws', async () => {
    const { dispatch, held, reloads } = setup({
      storage: () => {
        throw new DOMException('The operation is insecure.', 'SecurityError');
      },
    });
    dispatch();
    held.answer(404);
    await settle();
    expect(reloads()).toBe(1);
  });
});
