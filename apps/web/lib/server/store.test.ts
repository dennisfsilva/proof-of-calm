import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
const { memoryStore, storeFromEnv, upstashStore } = await import('./store');

describe('the route handlers’ store', () => {
  it('keeps values and counts in memory without Upstash', async () => {
    const store = storeFromEnv({});
    expect(await store.get('prices:last')).toBeNull();
    await store.set('prices:last', '{"at":1}');
    expect(await store.get('prices:last')).toBe('{"at":1}');
    await store.increment('csp:2026-10-17', 'img-src https://example.com', 60);
    await store.increment('csp:2026-10-17', 'img-src https://example.com', 60);
    await store.increment('csp:2026-10-17', 'script-src eval', 60);
    expect(await store.counts('csp:2026-10-17')).toEqual({ 'img-src https://example.com': 2, 'script-src eval': 1 });
    expect(await memoryStore().counts('csp:2026-10-17')).toEqual({});
  });

  it('forgets a value in memory once its time to live has passed', async () => {
    let now = 0;
    const store = memoryStore(() => now);
    await store.set('prices:last', 'copy', 60);
    now = 59_999;
    expect(await store.get('prices:last')).toBe('copy');
    now = 60_000;
    expect(await store.get('prices:last')).toBeNull();
  });

  it('maps the operations onto Redis commands, strings only', async () => {
    const redis = {
      get: vi.fn(async (): Promise<unknown> => 'stored'),
      set: vi.fn(async () => 'OK' as const),
      hincrby: vi.fn(async () => 1),
      expire: vi.fn(async () => 1 as const),
      hgetall: vi.fn(async (): Promise<Record<string, unknown> | null> => ({ 'script-src inline': '3' })),
    };
    const store = upstashStore(redis as never);
    expect(await store.get('key')).toBe('stored');
    redis.get.mockResolvedValueOnce(42);
    expect(await store.get('key')).toBeNull();
    await store.set('key', 'value');
    await store.set('prices:last', 'copy', 86_400);
    await store.increment('csp:2026-10-17', 'script-src inline', 63_072_000);
    expect(redis.set).toHaveBeenCalledWith('key', 'value');
    expect(redis.set).toHaveBeenCalledWith('prices:last', 'copy', { ex: 86_400 });
    expect(redis.hincrby).toHaveBeenCalledWith('csp:2026-10-17', 'script-src inline', 1);
    expect(redis.expire).toHaveBeenCalledWith('csp:2026-10-17', 63_072_000);
    expect(await store.counts('csp:2026-10-17')).toEqual({ 'script-src inline': 3 });
    redis.hgetall.mockResolvedValueOnce(null);
    expect(await store.counts('csp:2026-10-18')).toEqual({});
  });

  it('uses Upstash only when both variables are set', async () => {
    const memory = storeFromEnv({ UPSTASH_REDIS_REST_URL: 'https://eu1.upstash.io' });
    await memory.set('key', 'value');
    expect(await memory.get('key')).toBe('value');
    const upstash = storeFromEnv({
      UPSTASH_REDIS_REST_URL: 'https://eu1.upstash.io',
      UPSTASH_REDIS_REST_TOKEN: 'token',
    });
    expect(Object.keys(upstash)).toEqual(['get', 'set', 'increment', 'counts']);
  });
});
