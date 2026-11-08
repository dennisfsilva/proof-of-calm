import { describe, expect, it } from 'vitest';
import { taxYearPool, taxYearPoolCsv } from '../../src/export/tax-year-pool';
import expected from './gb-2026-27.csv?raw';
import { EXPORT_DAY, GB_ENTRIES, GB_HEADER, GB_PLAN, GB_RULES, SPAN_2026_27 } from './gb-fixture';

// The GB half of the tax-year export's proof (docs/DOMAIN.md §3.13): the raw listing of 2026-27, compared
// with the CSV derived by hand in gb-2026-27.csv.

describe('the UK raw listing, 2026-27', () => {
  const pool = taxYearPool(GB_PLAN, GB_ENTRIES, GB_RULES, SPAN_2026_27, EXPORT_DAY);

  it('the GB fixture gives the expected CSV', () => {
    expect(taxYearPoolCsv(pool, GB_HEADER)).toBe(expected.replace(/\n$/u, ''));
  });

  it('flags the lot with no cost and the one-tap units, and the window closed on the export day', () => {
    expect(pool).toMatchObject({
      span: SPAN_2026_27,
      lotRule: 'pooled',
      ongoing: false,
      windowOpen: false,
      uncosted: true,
      estimated: true,
    });
  });
});
