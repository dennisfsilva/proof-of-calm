import { describe, expect, it } from 'vitest';
import { FETCHED_AT_HEADER, stampCopy } from './prices-copy';

describe('stampCopy (ADR-0033 Readings, 2026-10-27)', () => {
  const now = new Date('2026-10-27T09:00:00.000Z');

  it('keeps an answer with the time the worker fetched it, the body and the server headers unchanged', async () => {
    const answer = Response.json({ at: '2026-10-27T08:59:00.000Z' }, { headers: { 'x-proof-of-calm-stale': 'false' } });
    const copy = await stampCopy(answer, now);
    expect(copy?.status).toBe(200);
    expect(copy?.headers.get(FETCHED_AT_HEADER)).toBe('2026-10-27T09:00:00.000Z');
    expect(copy?.headers.get('x-proof-of-calm-stale')).toBe('false');
    expect(copy?.headers.get('content-type')).toBe('application/json');
    expect(await copy?.json()).toEqual({ at: '2026-10-27T08:59:00.000Z' });
  });

  it('keeps no copy of an error status', async () => {
    expect(await stampCopy(Response.json({ error: 'prices-unavailable' }, { status: 503 }), now)).toBeNull();
  });
});
