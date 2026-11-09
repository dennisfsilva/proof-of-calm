import { describe, expect, it } from 'vitest';
import { anEntry, aPlan, asV2Plan, BTC, date, instant, PreviousBuildPlanSchema } from '../../test/builders';
import { BACKUP_FORMAT, BACKUP_SCHEMA_VERSION, BackupFileSchema } from './backup';
import { CoinSchema } from './coin';
import { CountryRulesSchema } from './country';
import { HoldingRuleSchema } from './holding-rule';
import { CoinIdSchema, CountryCodeSchema, EntityIdSchema } from './ids';
import { PLAN_SCHEMA_VERSION, PlanSchema } from './plan';
import { DEFAULT_PREFS, PrefsSchema } from './prefs';
import { PriceHistoriesSchema, PriceHistorySchema, PriceSnapshotSchema } from './prices';
import { TemplateSchema } from './template';
import { upgradePlan, writtenPlan } from './upgrade';

describe('ids', () => {
  it('accepts UUIDs and prototype ids, and nothing else', () => {
    expect(EntityIdSchema.safeParse('3f2b9c8e-1d4a-4b6f-9e2d-0a1b2c3d4e5f').success).toBe(true);
    expect(EntityIdSchema.safeParse('pmh3k2x1abcde').success).toBe(true);
    expect(EntityIdSchema.safeParse('3F2B9C8E-1D4A-4B6F-9E2D-0A1B2C3D4E5F').success).toBe(false);
    expect(EntityIdSchema.safeParse('p').success).toBe(false);
  });

  it('accepts tickers and country codes', () => {
    expect(['BTC', 'LINK', 'BRK.B', '$TEST', 'A-1'].map((value) => CoinIdSchema.safeParse(value).success)).toEqual([
      true,
      true,
      true,
      true,
      true,
    ]);
    expect(['btc', '', 'TOOLONGTICKER1'].map((value) => CoinIdSchema.safeParse(value).success)).toEqual([
      false,
      false,
      false,
    ]);
    expect(['PT', 'XX', 'pt', 'PRT'].map((value) => CountryCodeSchema.safeParse(value).success)).toEqual([
      true,
      true,
      false,
      false,
    ]);
  });
});

describe('coin and holding rule', () => {
  it('validates coins', () => {
    expect(CoinSchema.safeParse(BTC).success).toBe(true);
    expect(CoinSchema.safeParse({ ...BTC, color: '#cb5a00' }).success).toBe(true);
    expect(CoinSchema.safeParse({ ...BTC, color: 'orange' }).success).toBe(false);
    expect(CoinSchema.safeParse({ ...BTC, decimals: 11 }).success).toBe(false);
    expect(CoinSchema.safeParse({ ...BTC, geckoId: 'Bitcoin' }).success).toBe(false);
  });

  it('validates the three kinds of holding rule', () => {
    expect(HoldingRuleSchema.safeParse({ kind: 'none' }).success).toBe(true);
    expect(HoldingRuleSchema.safeParse({ kind: 'days', days: 365, effect: 'exempt' }).success).toBe(true);
    expect(HoldingRuleSchema.safeParse({ kind: 'years', years: 1, effect: 'lower-rate' }).success).toBe(true);
    expect(HoldingRuleSchema.safeParse({ kind: 'days', days: 0, effect: 'exempt' }).success).toBe(false);
    expect(HoldingRuleSchema.safeParse({ kind: 'days', days: 365 }).success).toBe(false);
    expect(HoldingRuleSchema.safeParse({ kind: 'months', months: 12, effect: 'exempt' }).success).toBe(false);
  });
});

describe('prefs and prices', () => {
  it('has valid defaults', () => {
    expect(PrefsSchema.parse(DEFAULT_PREFS)).toEqual(DEFAULT_PREFS);
    expect(PrefsSchema.safeParse({ ...DEFAULT_PREFS, chartRange: '5y' }).success).toBe(false);
    expect(DEFAULT_PREFS.motion).toBe('system');
  });

  it('fills the motion preference with system when a stored object predates it', () => {
    const { motion, ...before } = DEFAULT_PREFS;
    expect(motion).toBe('system');
    expect(PrefsSchema.parse(before)).toEqual(DEFAULT_PREFS);
    expect(PrefsSchema.parse({ ...DEFAULT_PREFS, motion: 'reduce' }).motion).toBe('reduce');
    expect(PrefsSchema.safeParse({ ...DEFAULT_PREFS, motion: 'none' }).success).toBe(false);
  });

  it('validates a price snapshot and a history', () => {
    const snapshot = {
      at: instant('2026-10-16T14:05:00+01:00'),
      prices: { BTC: { EUR: '70000.12', USD: '81533.4' }, ETH: { EUR: '2100' } },
      change24h: { BTC: '-1.2' },
    };
    expect(PriceSnapshotSchema.safeParse(snapshot).success).toBe(true);
    expect(PriceSnapshotSchema.safeParse({ ...snapshot, prices: { BTC: { SEK: '1' } } }).success).toBe(false);
    expect(
      PriceHistorySchema.safeParse([
        [date('2026-10-15'), '70000'],
        [date('2026-10-16'), '70100.5'],
      ]).success,
    ).toBe(true);
    expect(PriceHistorySchema.safeParse([['2026-10-15', 70000]]).success).toBe(false);
  });

  it('wants daily closes in ascending order, one per day, all in one named currency', () => {
    const closes = [
      ['2026-10-15', '70000'],
      ['2026-10-16', '70100.5'],
    ];
    expect(PriceHistorySchema.safeParse([...closes].reverse()).success).toBe(false);
    expect(PriceHistorySchema.safeParse([closes[0], closes[0]]).success).toBe(false);
    expect(PriceHistorySchema.safeParse([]).success).toBe(true);
    expect(PriceHistoriesSchema.safeParse({ currency: 'EUR', coins: { BTC: closes } }).success).toBe(true);
    expect(PriceHistoriesSchema.safeParse({ currency: 'SEK', coins: { BTC: closes } }).success).toBe(false);
  });
});

describe('plan schema v3 and the upgrade from v2 (docs/DOMAIN.md §2.1)', () => {
  const acknowledged = aPlan({ riskAcknowledgedAt: instant('2026-10-22T09:00:00+01:00'), riskWordingVersion: 1 });

  it('parses a v3 plan, acknowledged or not', () => {
    expect(PLAN_SCHEMA_VERSION).toBe(3);
    expect(PlanSchema.safeParse(aPlan()).success).toBe(true);
    expect(PlanSchema.parse(acknowledged)).toEqual(acknowledged);
    expect(PlanSchema.safeParse({ ...acknowledged, riskWordingVersion: -1 }).success).toBe(false);
    expect(PlanSchema.safeParse({ ...acknowledged, riskWordingVersion: 1.5 }).success).toBe(false);
    expect(PlanSchema.safeParse({ ...acknowledged, riskAcknowledgedAt: '2026-10-22' }).success).toBe(false);
  });

  it('refuses a v2 plan, which upgradePlan turns into a v3 plan with nothing acknowledged', () => {
    const plan = aPlan();
    expect(PlanSchema.safeParse(asV2Plan(plan)).success).toBe(false);
    expect(PlanSchema.parse(upgradePlan(asV2Plan(plan)))).toEqual(plan);
    expect(plan).toMatchObject({ riskAcknowledgedAt: null, riskWordingVersion: 0 });
  });

  it('returns anything that is not a v2 plan unchanged, for the schema to judge', () => {
    for (const other of [null, 'plan', [], acknowledged, { schemaVersion: 1 }, { ...acknowledged, schemaVersion: 4 }]) {
      expect(upgradePlan(other)).toBe(other);
    }
  });

  it('writes a plan with nothing recorded as the v2 plan the previous build reads, and upgradePlan gives it back', () => {
    const plan = aPlan();
    const written = writtenPlan(plan);
    expect(written).toStrictEqual({ schemaVersion: 2, payload: asV2Plan(plan) });
    expect(PreviousBuildPlanSchema.parse(written.payload)).toStrictEqual(written.payload);
    expect(PlanSchema.parse(upgradePlan(written.payload))).toStrictEqual(plan);
  });

  it('writes a plan with anything recorded as v3, unchanged, which the previous build cannot read', () => {
    const halves = [aPlan({ riskWordingVersion: 1 }), aPlan({ riskAcknowledgedAt: instant('2026-10-22T08:00:00Z') })];
    for (const plan of [acknowledged, ...halves]) {
      expect(writtenPlan(plan)).toStrictEqual({ schemaVersion: 3, payload: plan });
      expect(PreviousBuildPlanSchema.safeParse(plan).success).toBe(false);
      expect(PlanSchema.parse(upgradePlan(writtenPlan(plan).payload))).toStrictEqual(plan);
    }
  });
});

describe('backup file (docs/DOMAIN.md §3.13)', () => {
  it('holds the plan and the entries under the Proof of Calm format', () => {
    const file = {
      format: BACKUP_FORMAT,
      schemaVersion: BACKUP_SCHEMA_VERSION,
      exportedAt: instant('2026-10-16T10:00:00Z'),
      plan: aPlan(),
      entries: [anEntry()],
    };
    expect(BackupFileSchema.safeParse(file).success).toBe(true);
    expect(BackupFileSchema.safeParse({ ...file, format: 'dca-plan' }).success).toBe(false);
    expect(BACKUP_SCHEMA_VERSION).toBe(5);
    expect(BackupFileSchema.safeParse({ ...file, schemaVersion: 1 }).success).toBe(false);
    expect(BackupFileSchema.safeParse({ ...file, schemaVersion: 2 }).success).toBe(false);
    expect(BackupFileSchema.safeParse({ ...file, schemaVersion: 3 }).success).toBe(false);
  });
});

describe('country rules and templates', () => {
  const portugal = {
    code: 'PT',
    name: 'Portugal',
    currency: 'EUR',
    locales: ['pt-PT'],
    numberFormatLocale: 'pt-PT',
    dateFormatLocale: 'pt-PT',
    timezones: ['Europe/Lisbon', 'Atlantic/Madeira', 'Atlantic/Azores'],
    taxYear: { start: '01-01', end: '12-31' },
    computationModel: { kind: 'per-lot' },
    holdingRule: { kind: 'days', days: 365, effect: 'exempt' },
    holdingRuleOverrides: [],
    holdingRuleConditions: ['Exempt sales must still be declared (Anexo G1 Q7).'],
    lotRule: 'fifo',
    lotScope: 'per-venue',
    status: {
      version: 1,
      changedOn: '2026-10-16',
      changeNotice: null,
      lastReviewed: '2026-10-16',
      nextReviewDue: '2027-01-15',
      confidence: 'high',
    },
    card: { summary60: 'kept by the loose schema' },
  };

  it('reads the fields the core uses and keeps the rest of the profile', () => {
    const parsed = CountryRulesSchema.parse(portugal);
    expect(parsed.lotScope).toBe('per-venue');
    expect((parsed as Record<string, unknown>).card).toEqual({ summary60: 'kept by the loose schema' });
    expect(CountryRulesSchema.safeParse({ ...portugal, taxYear: { start: '13-01', end: '12-31' } }).success).toBe(
      false,
    );
    expect(
      CountryRulesSchema.safeParse({ ...portugal, computationModel: { kind: 'wealth-snapshot', date: '01-01' } })
        .success,
    ).toBe(true);
    expect(CountryRulesSchema.safeParse({ ...portugal, lotRule: 'hifo' }).success).toBe(false);
  });

  it('reads a template', () => {
    const template = {
      id: 'btc-only-hold',
      name: 'Bitcoin only, no sell window',
      oneLine: 'One coin, bought every month, never sold by the plan.',
      riskLabel: 'High risk · single asset',
      explanation: 'Why someone picks it, and what can go wrong.',
      coins: [BTC],
      split: { BTC: '100' },
      sellWindow: null,
      references: {},
      lastReviewed: '2026-10-16',
    };
    expect(TemplateSchema.safeParse(template).success).toBe(true);
    expect(TemplateSchema.safeParse({ ...template, id: 'Bitcoin Only' }).success).toBe(false);
    expect(TemplateSchema.safeParse({ ...template, validUntil: '2028-06-01', lastBuy: '2028-06-01' }).success).toBe(
      true,
    );
  });
});
