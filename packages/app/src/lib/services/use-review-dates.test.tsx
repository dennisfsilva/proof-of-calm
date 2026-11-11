// @vitest-environment jsdom
import type { CalendarDate, Instant } from '@proofofcalm/core';
import { aPlan } from '@proofofcalm/core/testing';
import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { EMPTY_SNAPSHOT } from '../adapters/memory-store';
import { ServicesProvider } from './provider';
import { createTestServices } from './testing';
import { reviewSince, useReviewDates } from './use-review-dates';

// The two days the annual review counts from (docs/DOMAIN.md §3.12), named in the clock's zone, Europe/Lisbon here.

afterEach(cleanup);

function Probe() {
  const dates = useReviewDates();
  return <output>{dates === null ? 'none' : `${dates.createdOn} ${dates.reviewedOn ?? 'never'}`}</output>;
}

async function mount(createdAt: string | null, reviewedAt: string | null) {
  const plan = createdAt === null ? null : { ...aPlan(), createdAt: createdAt as Instant };
  const prefs = { ...EMPTY_SNAPSHOT.prefs, reviewedAt: reviewedAt as Instant | null };
  const services = createTestServices({ snapshot: { ...EMPTY_SNAPSHOT, plan, prefs } });
  render(
    <ServicesProvider services={services}>
      <Probe />
    </ServicesProvider>,
  );
  await act(() => services.start());
  return screen.getByRole('status').textContent;
}

const day = (value: string) => value as CalendarDate;

describe('useReviewDates', () => {
  it('names a creation just before midnight UTC by the next day in Lisbon in summer', async () => {
    expect(await mount('2026-06-30T23:30:00Z', null)).toBe('2026-07-01 never');
  });

  it('names the last review in the same zone', async () => {
    expect(await mount('2026-04-05T10:00:00Z', '2027-07-31T23:59:00Z')).toBe('2026-04-05 2027-08-01');
  });

  it('is null without a plan', async () => {
    expect(await mount(null, '2027-07-31T10:00:00Z')).toBe('none');
  });
});

describe('reviewSince', () => {
  it('counts from the creation day with no review', () => {
    expect(reviewSince({ createdOn: day('2026-04-05'), reviewedOn: null })).toEqual({
      kind: 'created',
      on: '2026-04-05',
    });
  });

  it('ignores a review dated before the creation day', () => {
    expect(reviewSince({ createdOn: day('2026-04-05'), reviewedOn: day('2026-04-04') })).toEqual({
      kind: 'created',
      on: '2026-04-05',
    });
  });

  it('counts from a review after the creation day', () => {
    expect(reviewSince({ createdOn: day('2026-04-05'), reviewedOn: day('2027-11-11') })).toEqual({
      kind: 'reviewed',
      on: '2027-11-11',
    });
  });

  it('names a review on the creation day as the review', () => {
    expect(reviewSince({ createdOn: day('2026-04-05'), reviewedOn: day('2026-04-05') })).toEqual({
      kind: 'reviewed',
      on: '2026-04-05',
    });
  });
});
