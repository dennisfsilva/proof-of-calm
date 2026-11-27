// One exchange's requests, paced (ADR-0036, Reading of 2026-11-27: Kraken's public endpoints take "at
// most one request a second per address", backing off when limited). The runner wraps each exchange's
// io once, so the spacing holds across every pair of a run. A limited answer (HTTP 429, or Kraken's
// rate-limit error in the body's `error` array) is retried after an exponential wait; the fourth gives
// up with `RateLimited`, whose message is the closed-set status the reader names.
import type { SourceIo } from './sources/source.ts';

/** Requests per call before a limited answer gives up. */
export const PACE_TRIES = 4;

/** The pacer gave up: every try was limited. */
export class RateLimited extends Error {
  constructor() {
    super('rate limited');
    this.name = 'RateLimited';
  }
}

// Kraken's rate-limit errors (its REST API's error list); any other error is the reader's to refuse.
const LIMIT_ERRORS = ['EAPI:Rate limit exceeded', 'EGeneral:Too many requests'];

async function limited(response: Response): Promise<boolean> {
  if (response.status === 429) return true;
  try {
    const body: unknown = JSON.parse(await response.clone().text());
    const errors = (body as { error?: unknown } | null)?.error;
    return Array.isArray(errors) && errors.some((error) => LIMIT_ERRORS.some((limit) => error === limit));
  } catch {
    return false;
  }
}

/** The io with its fetch paced: at least `minMs` between two requests, backing off when limited. */
export function pace(minMs: number, io: SourceIo): SourceIo {
  let next = Number.NEGATIVE_INFINITY;
  // Each request reserves its slot when it starts, so requests started together are spaced too.
  const slot = async () => {
    const now = io.now().getTime();
    const at = Math.max(now, next);
    next = at + minMs;
    if (at > now) await io.sleep(at - now);
  };
  const paced: typeof fetch = async (input, init) => {
    for (let attempt = 1; ; attempt += 1) {
      await slot();
      const response = await io.fetch(input, init);
      if (!(await limited(response))) return response;
      await response.body?.cancel().catch(() => undefined);
      if (attempt === PACE_TRIES) throw new RateLimited();
      await io.sleep(minMs * 2 ** attempt);
    }
  };
  return { ...io, fetch: paced };
}
