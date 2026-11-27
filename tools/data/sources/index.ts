// The exchanges' readers of daily closes, one per exchange; Coinbase's stays `null` (README.md).
import type { Exchange } from '@proofofcalm/data';
import { bitstamp } from './bitstamp.ts';
import { coinbase } from './coinbase.ts';
import { kraken } from './kraken.ts';
import type { Source } from './source.ts';

export type { Source, SourceIo } from './source.ts';

export const SOURCES: Record<Exchange, Source | null> = { kraken, bitstamp, coinbase };
