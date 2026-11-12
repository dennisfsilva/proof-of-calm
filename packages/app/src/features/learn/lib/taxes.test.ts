import type { CalendarDate } from '@proofofcalm/core';
import { describe, expect, it } from 'vitest';
import { reviewLine, TAXES_MODULE } from './taxes';

// The line under a module's title (docs/CONTENT-STYLE.md §5): overdue from the day after `nextReviewDue`, never on
// the due day itself, as the core's `underReview` counts; until then the tax module names its next review.

const DUE = '2027-01-01';
const day = (date: string) => date as CalendarDate;

describe('reviewLine', () => {
  it.each([
    ['2026-12-31', 'next'],
    ['2027-01-01', 'next'],
    ['2027-01-02', 'overdue'],
  ] as const)('Taxes where you live on %s: %s', (today, line) => {
    expect(reviewLine({ slug: TAXES_MODULE, nextReviewDue: DUE }, day(today))).toBe(line);
  });

  it.each([
    ['2026-12-31', 'reviewed'],
    ['2027-01-01', 'reviewed'],
    ['2027-01-02', 'overdue'],
  ] as const)('another module on %s: %s', (today, line) => {
    expect(reviewLine({ slug: 'start-here', nextReviewDue: DUE }, day(today))).toBe(line);
  });
});
