import type { CoinId, PriceHistory, Result } from '@proofofcalm/core';
import { type Dataset, DatasetSchema } from '@proofofcalm/data';

// The simulator's price history (docs/EDUCATION.md §7 and §8): one dataset file per coin, served by the site at a
// relative path once the publish switch allows it (packages/data/README.md, The dataset). Until then the path
// answers 404, which is the screen's "not published yet", never a failure; a dataset that holds no day yet reads the
// same, as a coin with no closes yet, never as a broken file.

/** Why the closes are not there: not published yet, not reachable now, or not a dataset of this coin. */
export type ClosesFailure =
  | { readonly kind: 'unpublished' }
  | { readonly kind: 'offline' }
  | { readonly kind: 'invalid' };

/** The dataset file of a coin, relative to the site's origin. */
export const closesPath = (coin: CoinId) => `/data/prices/${coin}-EUR.json`;

const failed = (kind: ClosesFailure['kind']): Result<Dataset, ClosesFailure> => ({ ok: false, error: { kind } });

/**
 * The api client's wait (lib/adapters/api-client.ts), kept here rather than imported: the closes are static data
 * from the host's own origin, not an API call (docs/ARCHITECTURE.md), and the client lives in Today's chunk.
 */
const DEFAULT_TIMEOUT_MS = 10_000;

/**
 * Loads one coin's reference closes in EUR. A 404, or a dataset of this coin with no day, is unpublished; a fetch
 * that rejects (fetch rejects with a TypeError when the network fails), a connection that stalls past `timeoutMs`
 * or drops mid-body, or any other error status is offline; a body that is not JSON, fails the schema or names
 * another coin is invalid.
 */
export async function loadReferenceCloses(
  coin: CoinId,
  fetcher: typeof fetch = fetch,
  timeoutMs = DEFAULT_TIMEOUT_MS,
): Promise<Result<Dataset, ClosesFailure>> {
  let response: Response;
  let text: string;
  try {
    // No cookies, as the api client sends none; the signal also ends a body that stalls mid-read.
    response = await fetcher(closesPath(coin), { credentials: 'omit', signal: AbortSignal.timeout(timeoutMs) });
    if (response.status === 404) return failed('unpublished');
    if (!response.ok) return failed('offline');
    text = await response.text();
  } catch {
    return failed('offline');
  }
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    return failed('invalid');
  }
  const parsed = DatasetSchema.safeParse(body);
  if (!parsed.success || parsed.data.coin !== coin) return failed('invalid');
  if (parsed.data.days.length === 0) return failed('unpublished');
  return { ok: true, value: parsed.data };
}

/** The dataset as the core's simulation takes it: `[date, close]` per day, the closes as the decimal strings stored. */
export const toPriceHistory = (dataset: Dataset): PriceHistory => dataset.days.map(({ date, close }) => [date, close]);
