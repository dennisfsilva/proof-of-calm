import { describe, expect, it } from 'vitest';
import { buildDateOf, type CalendarDate, utcDay, waitForBuild } from './check.ts';

const page = (head: string) => `<!doctype html>\n<html lang="en">\n<head>\n${head}\n</head>\n<body></body>\n</html>\n`;
const DAY = '2026-11-25' as CalendarDate;
const URL = 'https://example.test/en/holding-date';

describe('buildDateOf', () => {
  it('reads the day of the build-date meta', () => {
    expect(buildDateOf(page('<meta charset="utf-8">\n<meta name="build-date" content="2026-11-25">'))).toBe(DAY);
    expect(buildDateOf(page('<meta content="2026-11-25" name="build-date" >'))).toBe(DAY);
  });

  it('is null without the meta', () => {
    expect(buildDateOf(page('<meta charset="utf-8">'))).toBeNull();
    expect(buildDateOf(page('<meta name="description" content="2026-11-25">'))).toBeNull();
    expect(buildDateOf('')).toBeNull();
  });

  it('is null when the meta holds no real calendar date', () => {
    for (const content of ['2026-13-01', '2026-02-30', '25-11-2026', '2026-11-25T00:00:00Z', 'today', '']) {
      expect(buildDateOf(page(`<meta name="build-date" content="${content}">`)), content).toBeNull();
    }
    expect(buildDateOf(page('<meta name="build-date">'))).toBeNull();
  });
});

describe('utcDay', () => {
  it('is the UTC date of an instant, whatever the local offset', () => {
    expect(utcDay(new Date('2026-11-25T00:17:00Z'))).toBe(DAY);
    expect(utcDay(new Date('2026-11-25T23:59:59-05:00'))).toBe('2026-11-26');
  });
});

/** A fetch that answers each call with the next of `answers`: a page's day, an HTTP status or a thrown error. */
const fetchOf = (answers: (string | number | Error)[]) => {
  const calls: { url: string; init: RequestInit | undefined }[] = [];
  const fetch = async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init });
    const answer = answers[Math.min(calls.length, answers.length) - 1];
    if (answer instanceof Error) throw answer;
    if (typeof answer === 'number') return new Response('', { status: answer });
    return new Response(page(`<meta name="build-date" content="${answer}">`), { status: 200 });
  };
  return { fetch, calls };
};

describe('waitForBuild', () => {
  const sleeps: number[] = [];
  const sleep = async (ms: number) => {
    sleeps.push(ms);
  };

  it('succeeds on the attempt whose page shows the day, sleeping between attempts only', async () => {
    sleeps.length = 0;
    const { fetch, calls } = fetchOf(['2026-11-24', 503, new Error('socket hang up'), '2026-11-25', '2026-11-25']);
    const lines: string[] = [];
    const result = await waitForBuild({
      url: URL,
      day: DAY,
      fetch,
      sleep,
      attempts: 40,
      log: (line) => lines.push(line),
    });
    expect(result).toEqual({ ok: true, value: undefined });
    expect(calls).toHaveLength(4);
    expect(calls.every((call) => call.url === URL)).toBe(true);
    expect(sleeps).toEqual([30_000, 30_000, 30_000]);
    expect(lines).toEqual([
      'attempt 1/40: build-date 2026-11-24',
      'attempt 2/40: HTTP 503',
      'attempt 3/40: socket hang up',
      'attempt 4/40: build-date 2026-11-25',
    ]);
  });

  it('gives every attempt its own timeout and asks past every cache', async () => {
    const { fetch, calls } = fetchOf(['2026-11-24', '2026-11-25']);
    await waitForBuild({ url: URL, day: DAY, fetch, sleep, attempts: 3 });
    const [first, second] = calls.map((call) => call.init);
    expect(first?.signal).toBeInstanceOf(AbortSignal);
    expect(second?.signal).toBeInstanceOf(AbortSignal);
    expect(first?.signal).not.toBe(second?.signal);
    expect(first?.cache).toBe('no-store');
  });

  // A check started at 23:58 UTC waits on a build that renders after midnight and names the next day.
  it('succeeds on a page that shows a later day than the check’s', async () => {
    sleeps.length = 0;
    const { fetch, calls } = fetchOf(['2026-11-26']);
    const result = await waitForBuild({ url: URL, day: DAY, fetch, sleep, attempts: 40 });
    expect(result).toEqual({ ok: true, value: undefined });
    expect(calls).toHaveLength(1);
    expect(sleeps).toEqual([]);
  });

  it('waits on a page of the day before and fails after the last attempt, naming what production showed last', async () => {
    sleeps.length = 0;
    const { fetch, calls } = fetchOf(['2026-11-24']);
    const result = await waitForBuild({ url: URL, day: DAY, fetch, sleep, attempts: 3 });
    expect(calls).toHaveLength(3);
    expect(sleeps).toHaveLength(2);
    expect(result).toEqual({
      ok: false,
      error: `${URL} did not show a build of 2026-11-25 or later after 3 attempts (last: build-date 2026-11-24)`,
    });
  });

  it('fails on a page without the meta', async () => {
    const fetch = async () => new Response(page('<meta charset="utf-8">'), { status: 200 });
    const result = await waitForBuild({ url: URL, day: DAY, fetch, sleep, attempts: 1 });
    expect(result).toEqual({
      ok: false,
      error: `${URL} did not show a build of 2026-11-25 or later after 1 attempt (last: no build-date meta)`,
    });
  });
});
