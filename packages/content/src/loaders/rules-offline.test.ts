import { expect, it, vi } from 'vitest';
import { loadRules } from './rules.ts';

// A language's rules chunk sits outside the worker's precache (ADR-0045 Deviations, 2026-11-15), so offline before
// it was ever fetched its import rejects: loadRules then answers the English file (ADR-0057), which carries the same
// holding rule, numbers and dates, so Today still shows its holding lines.
vi.mock('../../rules/pt-PT/pt.json', () => {
  throw new TypeError('Failed to fetch dynamically imported module');
});

it("answers the English rules when a language's rules chunk fails to load", async () => {
  const english = await loadRules('PT');
  expect(english?.code).toBe('PT');
  expect(await loadRules('PT', 'pt-PT')).toBe(english);
});

// In the web host a failed import now rejects (apps/web/src/chunk-reload.ts leaves `vite:preloadError`'s default);
// Vite's preload wrapper resolves it to undefined only under a listener that prevents it; the guard stays as defence.
vi.mock('../../rules/pt-PT/es.json', () => ({}));

it('answers the English rules when the import resolves without the file, as the preload wrapper does', async () => {
  const english = await loadRules('ES');
  expect(english?.code).toBe('ES');
  expect(await loadRules('ES', 'pt-PT')).toBe(english);
});

it("answers the language's file where its chunk loads", async () => {
  const translated = await loadRules('DE', 'pt-PT');
  expect(translated).toEqual(await loadRules('DE'));
  expect(translated).not.toBe(await loadRules('DE'));
});
