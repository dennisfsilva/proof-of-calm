import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { date } from '../../test/builders';
import { REVIEW_SNOOZE_DAYS } from '../constants';
import { addDays, type CalendarDate, daysBetween } from '../dates/calendar';
import { type BannerState, bannerFor, withBannerKey } from './banner';

// The annual review's place among the banners (docs/DOMAIN.md §3.11): its snooze and its one stored key, over
// stored lists of every kind. The examples name the edges: a key on day 29 and on day 30 of the snooze, several
// review keys at once (as a list written by more than one tab or build may hold), keys of the other kinds, a key
// dated after today and a key that is not a date.

const today = date('2026-10-30');
const REVIEW = 'annual-review:';

/** A day from 400 days before today to 40 days after it. */
const day = fc.integer({ min: -400, max: 40 }).map((offset) => addDays(today, offset));
const key = fc.oneof(
  day.map((on) => `${REVIEW}${on}`),
  day.map((on) => `red-day:${on}`),
  day.map((on) => `backup-needed:${on}`),
  fc.integer({ min: 1, max: 5 }).map((version) => `rule-change:${version}`),
  fc.constantFrom(`${REVIEW}soon`, 'red-day:soon', 'backup-needed:soon', 'unknown-kind'),
);
const dismissed = fc.array(key, { maxLength: 8 });
const state = fc.record({
  redDay: fc.option(
    day.chain((start) =>
      fc
        .integer({ min: 0, max: 40 })
        .map((span) => ({ start, last: addDays(start, Math.min(span, Math.max(0, daysBetween(start, today)))) })),
    ),
  ),
  ruleChange: fc.option(fc.integer({ min: 1, max: 5 }).map((version) => ({ version }))),
  annualReview: fc.boolean(),
  backupNeeded: fc.boolean(),
  dismissed,
});

/** A stored review key snoozes the review while its day is on or before today and fewer than 30 days old. */
const snoozes = (stored: string) => {
  if (!stored.startsWith(REVIEW)) return false;
  const on = stored.slice(REVIEW.length);
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(on)) return false;
  const days = daysBetween(on as CalendarDate, today);
  return days >= 0 && days < REVIEW_SNOOZE_DAYS;
};

const reviewKeys = (keys: readonly string[]) => keys.filter((stored) => stored.startsWith(REVIEW));

const examples: [readonly string[]][] = [
  [[`${REVIEW}${addDays(today, -29)}`]],
  [[`${REVIEW}${addDays(today, -30)}`]],
  [[`${REVIEW}${addDays(today, -40)}`, `${REVIEW}${addDays(today, -3)}`, `${REVIEW}${addDays(today, 5)}`]],
  [[`${REVIEW}${addDays(today, 1)}`, `${REVIEW}soon`]],
  [[`red-day:${today}`, `backup-needed:${today}`, 'rule-change:2', `${REVIEW}${today}`]],
];

describe('bannerFor and withBannerKey, the annual review (docs/DOMAIN.md §3.11)', () => {
  it('bannerFor never returns a dismissed key', () => {
    fc.assert(
      fc.property(state, (drawn) => {
        const banner = bannerFor({ today, ...drawn } satisfies BannerState);
        if (banner !== null) expect(drawn.dismissed).not.toContain(banner.key);
      }),
    );
  });

  it('it never returns the review while a review key fewer than 30 days old, not after today, is stored', () => {
    fc.assert(
      fc.property(state, (drawn) => {
        const banner = bannerFor({ today, ...drawn });
        const snoozed = drawn.dismissed.some(snoozes);
        if (snoozed) expect(banner?.kind).not.toBe('annual-review');
        // With nothing above it and the review asked, it shows exactly when no key snoozes it.
        if (drawn.annualReview && drawn.ruleChange === null && drawn.redDay === null) {
          expect(banner?.kind === 'annual-review').toBe(!snoozed);
        }
      }),
      { examples: examples.map(([keys]) => [{ redDay: null, ruleChange: null, annualReview: true, backupNeeded: true, dismissed: [...keys] }]) },
    );
  });

  it('withBannerKey holds the key and at most one review key, and keeps whether the review is snoozed', () => {
    fc.assert(
      fc.property(dismissed, key, (stored, added) => {
        const after = withBannerKey(stored, added, today);
        expect(after.at(-1)).toBe(added);
        expect(after.filter((kept) => kept === added)).toHaveLength(1);
        expect(reviewKeys(after).length).toBeLessThanOrEqual(1);
        // Every key of another kind is kept, but the red-day keys older than RED_DAY.keptDays.
        for (const kept of stored.filter((one) => !one.startsWith(REVIEW) && !one.startsWith('red-day:'))) {
          expect(after).toContain(kept);
        }
        if (!added.startsWith(REVIEW)) {
          expect(after.some(snoozes)).toBe(stored.some(snoozes));
        }
      }),
      { examples: examples.map(([keys]) => [[...keys], `backup-needed:${today}`]) },
    );
  });
});
