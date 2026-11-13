// An import file's text (docs/DOMAIN.md §3.13 and §7): text that is not JSON goes to the core's exchange reader
// (a Kraken ledger, or the code that names why it is not one), an export of the DCA plan page is read as a
// prototype file with its purchase count (its import needs the country, so the core's `importPrototype` runs in
// the action), and anything else goes to the core's `readBackup`, which validates it with the backup's zod schema.
import {
  type BackupError,
  type BackupFile,
  type CalendarDate,
  type ExchangeFile,
  type ExchangeFileError,
  err,
  type ImportContext,
  type Instant,
  importId,
  ok,
  type Plan,
  type Prefs,
  type Result,
  readBackup,
  readExchangeFile,
  recogniseImport,
} from '@proofofcalm/core';
import { epochMs, todayIn } from '../../../lib/adapters';

export type ReadImport =
  | { readonly kind: 'backup'; readonly file: BackupFile }
  | { readonly kind: 'prototype'; readonly json: unknown; readonly count: number }
  | { readonly kind: 'exchange'; readonly file: ExchangeFile };

export function readImport(text: string): Result<ReadImport, BackupError | ExchangeFileError> {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    const file = readExchangeFile(text);
    return file.ok ? ok({ kind: 'exchange', file: file.value }) : err(file.error);
  }
  if (recogniseImport(json) === 'prototype') {
    const { purchases } = json as { readonly purchases: readonly unknown[] };
    return ok({ kind: 'prototype', json, count: purchases.length });
  }
  const read = readBackup(json);
  return read.ok ? ok({ kind: 'backup', file: read.value }) : read;
}

/** The exchange import's context on this device: dates in its zone, ids from the rows' keys (D11). */
export function exchangeContext(today: CalendarDate, now: Instant, timeZone: string): ImportContext {
  return { today, now, dateOf: (at) => todayIn(epochMs(at), timeZone), idOf: importId };
}

/**
 * The device's preferences in the write that stores `plan` from an import, with the ones a prototype file
 * brings (docs/DOMAIN.md §3.12, §3.13): a review recorded here belongs to the plan stored then, so a plan with
 * another id, or one taken onto a device with none, starts with no review.
 */
export function importedPrefs(
  stored: { readonly plan: Plan | null; readonly prefs: Prefs },
  plan: Plan,
  taken: Partial<Prefs> = {},
): Prefs {
  const reviewedAt = stored.plan?.id === plan.id ? stored.prefs.reviewedAt : null;
  return { ...stored.prefs, ...taken, reviewedAt };
}
