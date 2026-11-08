import 'server-only';
import { COINS } from '@proofofcalm/content';
import { CURRENCIES } from '@proofofcalm/core';
import { type UpstreamMatrix, UpstreamMatrixSchema } from './snapshot';

// CoinGecko Demo, server-side only (ADR-0036): one /simple/price call for the whole coin × currency
// matrix. The key goes in the header the Demo authentication guide names, never in a URL or a log. The
// coins are the catalogue of packages/content, the allow-list of docs/SECURITY.md §2: no id is passed
// through from a caller, and the route always asks for all of them, so the call does not depend on one.
const ROOT = 'https://api.coingecko.com/api/v3';

function upstreamUrl(): string {
  const params = new URLSearchParams({
    ids: COINS.map((coin) => coin.geckoId).join(','),
    vs_currencies: CURRENCIES.map((code) => code.toLowerCase()).join(','),
    include_24hr_change: 'true',
    include_last_updated_at: 'true',
    precision: 'full',
  });
  return `${ROOT}/simple/price?${params.toString()}`;
}

export type Fetch = (input: string, init: RequestInit) => Promise<Response>;

/** The matrix, validated, or an error that the caller turns into the last good copy. */
export async function fetchMatrix(fetchFn: Fetch, apiKey: string | undefined): Promise<UpstreamMatrix> {
  const response = await fetchFn(upstreamUrl(), {
    headers: { accept: 'application/json', ...(apiKey ? { 'x-cg-demo-api-key': apiKey } : {}) },
    signal: AbortSignal.timeout(5000),
  });
  if (!response.ok) throw new Error(`CoinGecko answered ${response.status}`);
  const matrix = UpstreamMatrixSchema.safeParse(await response.json());
  if (!matrix.success) throw new Error('CoinGecko answered an unexpected shape');
  return matrix.data;
}
