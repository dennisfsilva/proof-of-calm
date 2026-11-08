import * as z from 'zod/mini';
import { MAX_ENTRIES } from '../constants';
import { InstantSchema } from '../dates/calendar';
import { EntrySchema } from './entry';
import { PlanSchema } from './plan';

// The JSON export: the backup format, the import format and the sync payload shape (docs/DOMAIN.md §3.13).
export const BACKUP_FORMAT = 'proof-of-calm';
/** The latest version this build reads and writes; `readBackup` also reads 2 and 3 (docs/DOMAIN.md §3.13). */
export const BACKUP_SCHEMA_VERSION = 4;

export const BackupFileSchema = z.strictObject({
  format: z.literal(BACKUP_FORMAT),
  schemaVersion: z.literal(BACKUP_SCHEMA_VERSION),
  exportedAt: InstantSchema,
  plan: PlanSchema,
  /** Soft-deleted entries are never exported; no export writes an entry twice. */
  entries: z.array(EntrySchema).check(
    z.maxLength(MAX_ENTRIES),
    z.refine((entries) => new Set(entries.map((entry) => entry.id)).size === entries.length, 'duplicate-id'),
  ),
});
export type BackupFile = z.infer<typeof BackupFileSchema>;
