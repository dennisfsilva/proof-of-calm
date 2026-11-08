// An import file's text (docs/DOMAIN.md §3.13 and §7): text that is not JSON is not recognised, an export of
// the DCA plan page is read as a prototype file with its purchase count (its import needs the country, so the
// core's `importPrototype` runs in the action), and anything else goes to the core's `readBackup`, which
// validates it with the backup's zod schema.
import {
  type BackupError,
  type BackupFile,
  err,
  ok,
  type Result,
  readBackup,
  recogniseImport,
} from '@proofofcalm/core';

export type ReadImport =
  | { readonly kind: 'backup'; readonly file: BackupFile }
  | { readonly kind: 'prototype'; readonly json: unknown; readonly count: number };

export function readImport(text: string): Result<ReadImport, BackupError> {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return err({ code: 'not-recognised' });
  }
  if (recogniseImport(json) === 'prototype') {
    const { purchases } = json as { readonly purchases: readonly unknown[] };
    return ok({ kind: 'prototype', json, count: purchases.length });
  }
  const read = readBackup(json);
  return read.ok ? ok({ kind: 'backup', file: read.value }) : read;
}
