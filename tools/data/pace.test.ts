import { describe, expect, it } from 'vitest';
import { PACE_TRIES, pace, REQUEST_TIMEOUT_MS, RateLimited } from './pace.ts';
import type { SourceIo } from './sources/index.ts';

// A clock that moves only when a sleep ends, and a fetch that answers from a script and records the
// clock's time at each request.
function fakeIo(answers: (() => Response)[]) {
  let time = Date.UTC(2026, 10, 27, 6, 0, 0);
  const requests: number[] = [];
  const sleeps: number[] = [];
  const timeouts: { at: number; ms: number; signal: AbortSignal }[] = [];
  const signals: (AbortSignal | null | undefined)[] = [];
  const io: SourceIo = {
    now: () => new Date(time),
    sleep: async (ms) => {
      sleeps.push(ms);
      const wake = time + ms;
      await Promise.resolve();
      time = Math.max(time, wake);
    },
    timeout: (ms) => {
      const signal = new AbortController().signal;
      timeouts.push({ at: time, ms, signal });
      return signal;
    },
    fetch: async (_input, init) => {
      requests.push(time);
      signals.push(init?.signal);
      const answer = answers.shift() ?? (() => Response.json({ error: [], result: {} }));
      return answer();
    },
  };
  return { io, requests, sleeps, timeouts, signals, gaps:() => requests.slice(1).map((at, i) => at - (requests[i] ?? at)) };
}

const ok = () => Response.json({ error: [], result: {} });
const tooMany = () => new Response('', { status: 429 });
const krakenLimited = () => Response.json({ error: ['EAPI:Rate limit exceeded'] });

describe('pace', () => {
  it('keeps at least the minimum between two requests to one exchange', async () => {
    const fake = fakeIo([ok, ok, ok]);
    const paced = pace(1000, fake.io);
    await paced.fetch('https://example.test/a');
    await paced.fetch('https://example.test/b');
    await paced.fetch('https://example.test/c');
    expect(fake.requests).toHaveLength(3);
    for (const gap of fake.gaps()) expect(gap).toBeGreaterThanOrEqual(1000);
  });

  it('keeps the minimum for requests started together', async () => {
    const fake = fakeIo([ok, ok, ok]);
    const paced = pace(1000, fake.io);
    await Promise.all([paced.fetch('https://example.test/a'), paced.fetch('https://example.test/b')]);
    await paced.fetch('https://example.test/c');
    for (const gap of fake.gaps()) expect(gap).toBeGreaterThanOrEqual(1000);
  });

  it('waits only for the rest of the minimum when time has passed since the last request', async () => {
    const fake = fakeIo([ok, ok]);
    const paced = pace(1000, fake.io);
    await paced.fetch('https://example.test/a');
    await fake.io.sleep(400);
    await paced.fetch('https://example.test/b');
    expect(fake.sleeps).toEqual([400, 600]);
  });

  it('backs off exponentially on HTTP 429 and returns the answer that follows', async () => {
    const fake = fakeIo([tooMany, tooMany, ok]);
    const response = await pace(1000, fake.io).fetch('https://example.test/a');
    expect(response.status).toBe(200);
    expect(fake.gaps()).toEqual([2000, 4000]);
  });

  it("backs off on Kraken's rate-limit error and hands the reader an unread body", async () => {
    const fake = fakeIo([krakenLimited, () => Response.json({ error: [], result: { ok: 1 } })]);
    const response = await pace(1000, fake.io).fetch('https://example.test/a');
    expect(await response.json()).toEqual({ error: [], result: { ok: 1 } });
    expect(fake.gaps()).toEqual([2000]);
  });

  it('passes any other answer through untouched, an error or a malformed body included', async () => {
    const fake = fakeIo([
      () => Response.json({ error: ['EQuery:Unknown asset pair'] }),
      () => new Response('{not json', { status: 200 }),
      () => new Response('', { status: 503 }),
    ]);
    const paced = pace(1000, fake.io);
    expect(await (await paced.fetch('https://example.test/a')).json()).toEqual({
      error: ['EQuery:Unknown asset pair'],
    });
    expect(await (await paced.fetch('https://example.test/b')).text()).toBe('{not json');
    expect((await paced.fetch('https://example.test/c')).status).toBe(503);
    expect(fake.requests).toHaveLength(3);
  });

  it('sends each try with its own request timeout, made after its slot and its back-off', async () => {
    const fake = fakeIo([tooMany, krakenLimited, ok, ok]);
    const paced = pace(1000, fake.io);
    await Promise.all([paced.fetch('https://example.test/a'), paced.fetch('https://example.test/b')]);
    expect(fake.requests).toHaveLength(4);
    expect(fake.timeouts.map((timeout) => timeout.at)).toEqual(fake.requests);
    expect(fake.timeouts.map((timeout) => timeout.ms)).toEqual(Array(4).fill(REQUEST_TIMEOUT_MS));
    expect(fake.signals).toEqual(fake.timeouts.map((timeout) => timeout.signal));
    expect(new Set(fake.signals).size).toBe(4);
    expect(REQUEST_TIMEOUT_MS).toBe(30_000);
  });

  it('gives up with a typed failure after the fourth limited answer', async () => {
    const fake = fakeIo([tooMany, krakenLimited, tooMany, krakenLimited, ok]);
    const failure = await pace(1000, fake.io)
      .fetch('https://example.test/a')
      .catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(RateLimited);
    expect((failure as Error).message).toBe('rate limited');
    expect(fake.requests).toHaveLength(PACE_TRIES);
    expect(PACE_TRIES).toBe(4);
    expect(fake.gaps()).toEqual([2000, 4000, 8000]);
  });
});
