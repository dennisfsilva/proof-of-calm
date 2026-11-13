// Recognises an exchange's export and reads it (docs/DOMAIN.md §3.13, the exchange import; ADR-0056). Kraken's
// ledger is the one export it reads; the second exchange's import is planned (M2).
import { err, ok, type Result } from '../../result';
import { type ExchangeFile, LEDGER_COLUMNS, REQUIRED_COLUMNS, readKrakenLedger } from './kraken';
import { csvRows } from './table';

/** Why a text is not read; "No refusal, left-out row or thrown error holds a cell's text." */
export type ExchangeFileError =
  | { readonly code: 'zip' }
  | { readonly code: 'not-recognised' }
  | { readonly code: 'kraken-trades' }
  | { readonly code: 'missing-columns'; readonly columns: readonly string[] }
  | { readonly code: 'no-rows' };

/**
 * "Text starting with `PK\^C\^D` is `zip`; a header with ordertxid and pair is `kraken-trades`; a header whose
 * names, a last empty one dropped, are all among the ledger's (txid, refid, time, type, subtype, aclass,
 * subclass, asset, wallet, amount, fee, balance, amountusd) is a Kraken ledger, which is `missing-columns`,
 * naming each, when it lacks txid, refid, time, type, asset, amount or fee; a ledger with no data row is
 * `no-rows`; anything else is `not-recognised`." K8 holds the headers that end in an empty name (a trailing
 * comma) and that add amountusd.
 */
export function readExchangeFile(text: string): Result<ExchangeFile, ExchangeFileError> {
  // D14: a ZIP archive's first four bytes.
  if (text.startsWith('PK\u0003\u0004')) return err({ code: 'zip' });
  const [names = [], ...data] = csvRows(text);
  if (names.includes('ordertxid') && names.includes('pair')) return err({ code: 'kraken-trades' });
  const header = names.at(-1) === '' ? names.slice(0, -1) : names;
  if (header.length === 0 || !header.every((name) => LEDGER_COLUMNS.includes(name))) {
    return err({ code: 'not-recognised' });
  }
  const missing = REQUIRED_COLUMNS.filter((name) => !header.includes(name));
  if (missing.length > 0) return err({ code: 'missing-columns', columns: missing });
  if (data.length === 0) return err({ code: 'no-rows' });
  return ok(readKrakenLedger(header, data));
}
