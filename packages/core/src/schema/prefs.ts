import * as z from 'zod/mini';
import { CHART_RANGES } from '../constants';
import { InstantSchema } from '../dates/calendar';

// Device-local preferences (docs/DOMAIN.md §2.3): not synced, not part of the plan.
export const ChartRangeSchema = z.enum(CHART_RANGES);
export type ChartRange = z.infer<typeof ChartRangeSchema>;

export const PrefsSchema = z.strictObject({
  theme: z.enum(['system', 'light', 'dark']),
  chartRange: ChartRangeSchema,
  lastBackupAt: z.nullable(InstantSchema),
  /** When the plan or the log last changed on this device; a backup is needed when it is newer. */
  changedAt: z.nullable(InstantSchema),
  /** Banner keys dismissed on this device, one per episode (docs/DOMAIN.md §3.11). */
  dismissedBanners: z.array(z.string().check(z.maxLength(80))),
  reviewedAt: z.nullable(InstantSchema),
  logShowAll: z.boolean(),
  /** In-app reduced motion (docs/DESIGN.md §6); additive: a record written before it reads as `system`. */
  motion: z._default(z.enum(['system', 'reduce']), 'system'),
});
export type Prefs = z.infer<typeof PrefsSchema>;

export const DEFAULT_PREFS: Prefs = {
  theme: 'system',
  chartRange: '30d',
  lastBackupAt: null,
  changedAt: null,
  dismissedBanners: [],
  reviewedAt: null,
  logShowAll: false,
  motion: 'system',
};
