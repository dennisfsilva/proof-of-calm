// The daily rebuild's check (docs/RELEASE.md; .github/workflows/daily-rebuild.yml): after the deploy hook's
// POST, production must show a build of the UTC day the check started or a later one (a build that renders after
// midnight names the next day), which the site pages name in their build-date meta (apps/web/src/site/head.ts).
// `node tools/rebuild/check.ts <url>` polls the page every 30 s, 40 times (20 minutes), each request stopped after
// 20 s, prints one line per attempt and exits 1 on a miss.
import { fileURLToPath } from 'node:url';

// The date helpers are here, not packages/core's calendar module: that module imports zod, and the workflow runs
// this script on a bare checkout with no install (the workspace-package rule of tools/README.md).
/** A `YYYY-MM-DD` string that names a real day. */
export type CalendarDate = string & { readonly calendarDate: unique symbol };
type Result<T, E> = { readonly ok: true; readonly value: T } | { readonly ok: false; readonly error: E };

const INTERVAL_MS = 30_000;
const ATTEMPTS = 40;
const REQUEST_TIMEOUT_MS = 20_000;
const META = /<meta\b[^>]*\bname="build-date"[^>]*>/;
const CONTENT = /\bcontent="([^"]*)"/;
const DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** The text as a calendar date, or null when it names no real day. */
function calendarDate(text: string): CalendarDate | null {
  const parts = DATE.exec(text);
  if (parts === null) return null;
  const [year, month, day] = parts.slice(1).map(Number) as [number, number, number];
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
    ? (text as CalendarDate)
    : null;
}

/** The day a page's build-date meta names, or null without the meta or a real day in it. */
export function buildDateOf(html: string): CalendarDate | null {
  const meta = META.exec(html)?.[0];
  const content = meta === undefined ? undefined : CONTENT.exec(meta)?.[1];
  return content === undefined ? null : calendarDate(content);
}

/** The UTC date of `now`, the day the build renders the pages at when `SITE_TODAY` is unset. */
export function utcDay(now: Date): CalendarDate {
  return now.toISOString().slice(0, 10) as CalendarDate;
}

/** Whether `shown` is `day` or a later day, compared as UTC midnights. */
function onOrAfter(shown: CalendarDate, day: CalendarDate): boolean {
  return Date.parse(`${shown}T00:00:00Z`) >= Date.parse(`${day}T00:00:00Z`);
}

type Wait = {
  url: string;
  day: CalendarDate;
  fetch: (url: string, init: RequestInit) => Promise<Response>;
  sleep: (ms: number) => Promise<void>;
  attempts: number;
  log?: (line: string) => void;
};

/** What one request saw: the page's day, or why it has none. */
async function look(url: string, fetch: Wait['fetch']): Promise<{ day: CalendarDate | null; seen: string }> {
  try {
    const response = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
    if (!response.ok) return { day: null, seen: `HTTP ${response.status}` };
    const day = buildDateOf(await response.text());
    return { day, seen: day === null ? 'no build-date meta' : `build-date ${day}` };
  } catch (error) {
    return { day: null, seen: error instanceof Error ? error.message : String(error) };
  }
}

/** Polls `url` until its build-date meta reads `day` or a later day, at most `attempts` times, 30 s apart. */
export async function waitForBuild({ url, day, fetch, sleep, attempts, log }: Wait): Promise<Result<void, string>> {
  let last = 'no answer';
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const { day: shown, seen } = await look(url, fetch);
    log?.(`attempt ${attempt}/${attempts}: ${seen}`);
    if (shown !== null && onOrAfter(shown, day)) return { ok: true, value: undefined };
    last = seen;
    if (attempt < attempts) await sleep(INTERVAL_MS);
  }
  const times = attempts === 1 ? 'attempt' : 'attempts';
  return { ok: false, error: `${url} did not show a build of ${day} or later after ${attempts} ${times} (last: ${last})` };
}

const isMain = process.argv[1] !== undefined && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  const url = process.argv[2];
  if (url === undefined || !url.startsWith('https://')) {
    console.error('usage: node tools/rebuild/check.ts <https url of a site page>');
    process.exit(2);
  }
  const result = await waitForBuild({
    url,
    day: utcDay(new Date()),
    fetch: (target, init) => fetch(target, init),
    sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    attempts: ATTEMPTS,
    log: (line) => console.log(line),
  });
  if (!result.ok) {
    console.error(result.error);
    process.exit(1);
  }
}
