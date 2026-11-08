import 'server-only';
import { Redis } from '@upstash/redis';

// The small key-value store the route handlers share (.env.example): Upstash Redis in eu-central-1 when
// both variables are set, otherwise memory, which is per function instance and empties on a cold
// start. Callers treat every failure as "nothing stored": a store problem never fails a response.
export interface KeyValueStore {
  get(key: string): Promise<string | null>;
  /** Stores `value` at `key`; with `ttlSeconds`, the value expires that long after this write. */
  set(key: string, value: string, ttlSeconds?: number): Promise<void>;
  /** Adds one to `field` of the hash at `key`, which expires `ttlSeconds` after its last increment. */
  increment(key: string, field: string, ttlSeconds: number): Promise<void>;
  counts(key: string): Promise<Record<string, number>>;
}

/** What the prices handler shares across the function's instances (ADR-0045 §2): a value with a time to live. */
export type SharedCache = Pick<KeyValueStore, 'get' | 'set'>;

/** `now` is injectable for tests; it decides when a value's time to live has passed. */
export function memoryStore(now: () => number = Date.now): KeyValueStore {
  const values = new Map<string, { readonly value: string; readonly expiresAt: number }>();
  const hashes = new Map<string, Map<string, number>>();
  return {
    get: async (key) => {
      const stored = values.get(key);
      if (stored === undefined) return null;
      if (now() < stored.expiresAt) return stored.value;
      values.delete(key);
      return null;
    },
    set: async (key, value, ttlSeconds) => {
      values.set(key, {
        value,
        expiresAt: ttlSeconds === undefined ? Number.POSITIVE_INFINITY : now() + ttlSeconds * 1000,
      });
    },
    increment: async (key, field) => {
      const hash = hashes.get(key) ?? new Map<string, number>();
      hash.set(field, (hash.get(field) ?? 0) + 1);
      hashes.set(key, hash);
    },
    counts: async (key) => Object.fromEntries(hashes.get(key) ?? []),
  };
}

type RedisCommands = Pick<Redis, 'get' | 'set' | 'hincrby' | 'expire' | 'hgetall'>;

export function upstashStore(redis: RedisCommands): KeyValueStore {
  return {
    get: async (key) => {
      const value = await redis.get<unknown>(key);
      return typeof value === 'string' ? value : null;
    },
    set: async (key, value, ttlSeconds) => {
      await (ttlSeconds === undefined ? redis.set(key, value) : redis.set(key, value, { ex: ttlSeconds }));
    },
    increment: async (key, field, ttlSeconds) => {
      await redis.hincrby(key, field, 1);
      await redis.expire(key, ttlSeconds);
    },
    counts: async (key) => {
      const hash = (await redis.hgetall<Record<string, unknown>>(key)) ?? {};
      return Object.fromEntries(Object.entries(hash).map(([field, count]) => [field, Number(count)]));
    },
  };
}

/** Upstash when it is configured, memory otherwise; a route module creates one per instance. */
export function storeFromEnv(env: Readonly<Record<string, string | undefined>> = process.env): KeyValueStore {
  const url = env.UPSTASH_REDIS_REST_URL;
  const token = env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return memoryStore();
  // Strings in, strings out, and one quick retry: the store is a fallback, never a wait.
  return upstashStore(
    new Redis({ url, token, automaticDeserialization: false, retry: { retries: 1, backoff: () => 50 } }),
  );
}
