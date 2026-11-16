import { describe, expect, it } from 'vitest';
import { aPlan, instant } from '../../test/builders';
import { compareInstants } from '../dates/calendar';
import { PlanSchema } from '../schema/plan';
import { acknowledge, acknowledgementDue } from './acknowledgement';

describe('acknowledgementDue (docs/DOMAIN.md §2.1)', () => {
  it('asks when a recorded version is below the current one', () => {
    expect(acknowledgementDue({ riskWordingVersion: 1 }, 2)).toBe(true);
    expect(acknowledgementDue({ riskWordingVersion: 3 }, 7)).toBe(true);
  });

  it('never asks with nothing recorded (null and 0)', () => {
    expect(acknowledgementDue(aPlan({ riskAcknowledgedAt: null, riskWordingVersion: 0 }), 2)).toBe(false);
  });

  it('never asks at or above the current version', () => {
    expect(acknowledgementDue({ riskWordingVersion: 2 }, 2)).toBe(false);
    // A rollback: the build that runs is older than the one that recorded the version.
    expect(acknowledgementDue({ riskWordingVersion: 3 }, 2)).toBe(false);
  });
});

describe('acknowledge (docs/DOMAIN.md §2.1)', () => {
  const stored = instant('2026-10-17T08:30:00.000Z');
  const recorded = aPlan({ riskAcknowledgedAt: stored, riskWordingVersion: 1, updatedAt: stored });

  it('records the time, the version and the language with a strictly later stamp', () => {
    const now = instant('2026-10-20T10:00:00.000Z');
    const acknowledged = acknowledge(recorded, 2, 'en', now);
    const { riskAcknowledgedAt, riskWordingVersion, riskLanguage, updatedAt, ...rest } = acknowledged;
    expect([riskAcknowledgedAt, riskWordingVersion, riskLanguage, updatedAt]).toEqual([now, 2, 'en', now]);
    const {
      riskAcknowledgedAt: _at,
      riskWordingVersion: _version,
      riskLanguage: _language,
      updatedAt: _stamp,
      ...before
    } = recorded;
    expect(rest).toEqual(before);
    expect(PlanSchema.parse(acknowledged)).toStrictEqual(acknowledged);

    // A clock behind the stored stamp: the acknowledgement keeps its time, the write still wins in sync.
    const behind = acknowledge(recorded, 2, 'en', instant('2026-10-17T08:00:00.000Z'));
    expect(behind.riskAcknowledgedAt).toBe('2026-10-17T08:00:00.000Z');
    expect(compareInstants(behind.updatedAt, stored)).toBeGreaterThan(0);
  });

  it('records the language of the text shown, replacing the one recorded before', () => {
    const now = instant('2026-10-20T10:00:00.000Z');
    expect(acknowledge(aPlan(), 1, 'pt-PT', now)).toMatchObject({ riskWordingVersion: 1, riskLanguage: 'pt-PT' });
    expect(acknowledge(acknowledge(aPlan(), 1, 'pt-PT', now), 2, 'en', now).riskLanguage).toBe('en');
  });
});
