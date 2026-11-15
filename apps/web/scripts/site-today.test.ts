import { resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { loadSiteToday } from './site-today';

const root = resolve(import.meta.dirname, '..');
const before = process.env.NODE_ENV;

afterEach(() => {
  process.env.NODE_ENV = before;
});

describe('the build’s site day', () => {
  // Plain node runs the build with NODE_ENV unset; Vite's module runner sets it to `development` then, and the
  // client build after it came out a development one that never registers the worker (src/main.tsx).
  it('leaves an unset NODE_ENV unset, so the client build stays a production one', async () => {
    delete process.env.NODE_ENV;
    const today = await loadSiteToday(root, '2026-10-20', new Date('2026-11-15T12:00:00Z'));
    expect(process.env.NODE_ENV).toBeUndefined();
    expect(today).toBe('2026-10-20');
  }, 10_000);

  it('leaves a set NODE_ENV as it was', async () => {
    process.env.NODE_ENV = 'production';
    await loadSiteToday(root, '2026-10-20', new Date('2026-11-15T12:00:00Z'));
    expect(process.env.NODE_ENV).toBe('production');
  }, 10_000);
});
