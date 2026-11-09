import { describe, expect, it } from 'vitest';
import {
  BACKUP_SNOOZE_DAYS,
  CHART_RANGES,
  ENTRY_NOTE_MAX_LENGTH,
  IMPORT_MAX_BYTES,
  LOG_PAGE,
  MAX_ENTRIES,
  MAX_SLOTS,
  NOTE_MAX_LENGTH,
  PRICE_FIGURES,
  PRICE_TTL,
  RED_DAY,
  REVIEW_INTERVAL_MONTHS,
  TOMBSTONE_TTL_DAYS,
  UNDO_WINDOW_MS,
  VENUE_MAX_LENGTH,
} from './constants';

// Pins the values of docs/DOMAIN.md §9 so that changing one is a deliberate, reviewed diff.
// Their boundaries are tested where they are used.
describe('constants', () => {
  it('match docs/DOMAIN.md §9', () => {
    expect(MAX_SLOTS).toBe(240);
    expect(NOTE_MAX_LENGTH).toBe(200);
    expect(ENTRY_NOTE_MAX_LENGTH).toBe(500);
    expect(VENUE_MAX_LENGTH).toBe(40);
    expect(LOG_PAGE).toBe(12);
    expect(UNDO_WINDOW_MS).toBe(8000);
    expect(TOMBSTONE_TTL_DAYS).toBe(90);
    expect(RED_DAY).toEqual({ sevenDay: '-10', fromHigh90: '-30', episodeClearDays: 7, coverDays: 7, keptDays: 365 });
    expect(CHART_RANGES).toEqual(['7d', '30d', '90d', '1y', 'all']);
    expect(PRICE_FIGURES).toBe(4);
    expect(PRICE_TTL).toEqual({ clientSeconds: 60, serverSeconds: 600 });
    expect(REVIEW_INTERVAL_MONTHS).toBe(12);
    expect(BACKUP_SNOOZE_DAYS).toBe(90);
    expect(MAX_ENTRIES).toBe(10_000);
    expect(IMPORT_MAX_BYTES).toBe(50_000_000);
  });
});
