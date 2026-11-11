import type { CalendarDate, Instant, ReviewDates } from '@proofofcalm/core';
import { useMemo } from 'react';
import { epochMs, todayIn } from '../adapters/clock';
import { useClock, useSnapshot } from './hooks';

// The two days the annual review counts from (docs/DOMAIN.md §3.12): the calendar days of the plan's
// `createdAt` and of `Prefs.reviewedAt`, named in the clock's zone, since the core never derives a date
// from an instant. Every screen that names them reads them here, so Today and Plan never disagree.

/** The days of the plan's creation and of the last review; null without a plan. */
export function useReviewDates(): ReviewDates | null {
  const { timeZone } = useClock();
  const createdAt = useSnapshot((snapshot) => snapshot.plan?.createdAt ?? null);
  const reviewedAt = useSnapshot((snapshot) => snapshot.prefs.reviewedAt);
  return useMemo(() => {
    if (createdAt === null) return null;
    const day = (instant: Instant) => todayIn(epochMs(instant), timeZone);
    return { createdOn: day(createdAt), reviewedOn: reviewedAt === null ? null : day(reviewedAt) };
  }, [createdAt, reviewedAt, timeZone]);
}

export type ReviewSince = { readonly kind: 'created' | 'reviewed'; readonly on: CalendarDate };

/** The later of the two days, the one `nextReviewOn` counts from: the review's when it is on or after the creation day. */
export function reviewSince({ createdOn, reviewedOn }: ReviewDates): ReviewSince {
  return reviewedOn !== null && reviewedOn >= createdOn
    ? { kind: 'reviewed', on: reviewedOn }
    : { kind: 'created', on: createdOn };
}
