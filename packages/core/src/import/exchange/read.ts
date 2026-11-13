// Recognises an exchange's export and reads it (docs/DOMAIN.md §3.13, the exchange import; ADR-0056): Kraken's
// ledger and Trade Republic's transaction export.
import { err, ok, type Result } from '../../result';
import {
  type ExchangeFile,
  type ExchangeId,
  isBlankRow,
  LEDGER_COLUMNS,
  REQUIRED_COLUMNS,
  readKrakenLedger,
} from './kraken';
import { csvRows } from './table';
import { readTradeRepublic, TR_COLUMNS, TR_READ } from './trade-republic';

/** Why a text is not read; "No refusal, left-out row or thrown error holds a cell's text." */
export type ExchangeFileError =
  | { readonly code: 'zip' }
  | { readonly code: 'not-recognised' }
  | { readonly code: 'kraken-trades' }
  | { readonly code: 'missing-columns'; readonly exchange: ExchangeId; readonly columns: readonly string[] }
  | {
      readonly code: 'unknown-columns';
      readonly exchange: ExchangeId;
      /** The unknown names that read as a column name; `others` counts the rest, never named. */
      readonly columns: readonly string[];
      readonly others: number;
    }
  | { readonly code: 'no-rows'; readonly exchange: ExchangeId };

/** A header name the alert may show: a column name's shape, never a cell's free text. */
const SAFE_NAME = /^[a-z_]{1,40}$/u;
/** The names a Trade Republic header holds and no Kraken header does. */
const TR_MARKS = ['transaction_id', 'asset_class', 'category'];

/**
 * "Text starting with `PK\^C\^D` is `zip`; a header with ordertxid and pair is `kraken-trades`; a header whose
 * names, a last empty one dropped, are all among the ledger's (txid, refid, time, type, subtype, aclass,
 * subclass, asset, wallet, amount, fee, balance, amountusd) is a Kraken ledger, which is `missing-columns`,
 * naming each, when it lacks txid, refid, time, type, asset, amount or fee; a ledger with no data row is
 * `no-rows`; anything else is `not-recognised`." K8 holds the headers that end in an empty name (a trailing
 * comma) and that add amountusd. A blank line is no data row (`isBlankRow`). A header holding transaction_id,
 * asset_class and category is Trade Republic's: `unknown-columns` with a name outside `TR_COLUMNS`, else
 * `missing-columns` without a `TR_READ` column, `no-rows` without a data row, else read.
 */
export function readExchangeFile(text: string): Result<ExchangeFile, ExchangeFileError> {
  // D14: a ZIP archive's first four bytes.
  if (text.startsWith('PK\u0003\u0004')) return err({ code: 'zip' });
  const [names = [], ...data] = csvRows(text);
  if (names.includes('ordertxid') && names.includes('pair')) return err({ code: 'kraken-trades' });
  const header = names.at(-1) === '' ? names.slice(0, -1) : names;
  if (TR_MARKS.every((name) => header.includes(name))) return readTradeRepublicFile(header, data);
  if (header.length === 0 || !header.every((name) => LEDGER_COLUMNS.includes(name))) {
    return err({ code: 'not-recognised' });
  }
  const missing = REQUIRED_COLUMNS.filter((name) => !header.includes(name));
  if (missing.length > 0) return err({ code: 'missing-columns', exchange: 'kraken', columns: missing });
  if (data.every(isBlankRow)) return err({ code: 'no-rows', exchange: 'kraken' });
  return ok(readKrakenLedger(header, data));
}

function readTradeRepublicFile(
  header: readonly string[],
  data: readonly (readonly string[])[],
): Result<ExchangeFile, ExchangeFileError> {
  const exchange = 'trade-republic';
  const unknown = header.filter((name) => !TR_COLUMNS.includes(name));
  if (unknown.length > 0) {
    const columns = unknown.filter((name) => SAFE_NAME.test(name));
    return err({ code: 'unknown-columns', exchange, columns, others: unknown.length - columns.length });
  }
  const missing = TR_READ.filter((name) => !header.includes(name));
  if (missing.length > 0) return err({ code: 'missing-columns', exchange, columns: missing });
  if (data.every(isBlankRow)) return err({ code: 'no-rows', exchange });
  return ok(readTradeRepublic(header, data));
}
