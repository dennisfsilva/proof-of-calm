import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { aPlan, asV2Plan, asV3Plan, instant, MainPlanV3Schema, PreviousBuildPlanSchema } from '../../test/builders';
import { LanguageTagSchema, PlanSchema } from './plan';
import { upgradePlan, writtenPlan } from './upgrade';

// Plans v4 (docs/DOMAIN.md §2.1): the acknowledgement names the language of the text shown. A plan is
// written at the lowest version that holds it, so main, which reads v2 and v3, reads every plan but one
// acknowledged in another language than English, and counts that one as newer (docs/RELEASE.md, Versioning).

const at = instant('2026-10-22T09:00:00.000Z');
const english = () => aPlan({ riskAcknowledgedAt: at, riskWordingVersion: 1, riskLanguage: 'en' });

describe('upgradePlan: reading plans written by earlier builds (forward)', () => {
  it('a v3 plan with an acknowledgement reads as acknowledged in en', () => {
    const plan = english();
    for (const halfway of [plan, aPlan({ riskWordingVersion: 1 }), aPlan({ riskAcknowledgedAt: at })]) {
      const read = PlanSchema.parse(upgradePlan(asV3Plan(halfway)));
      expect(read).toStrictEqual({ ...halfway, riskLanguage: 'en' });
    }
  });

  it('a v3 plan with nothing recorded reads null', () => {
    const plan = aPlan();
    expect(PlanSchema.parse(upgradePlan(asV3Plan(plan)))).toStrictEqual(plan);
    expect(plan).toMatchObject({ riskAcknowledgedAt: null, riskWordingVersion: 0, riskLanguage: null });
  });

  it('a v2 plan reads with null, 0 and null', () => {
    const plan = aPlan();
    expect(PlanSchema.parse(upgradePlan(asV2Plan(plan)))).toStrictEqual(plan);
  });

  it('a v4 plan, or anything else, is returned as written for the schema to judge', () => {
    const portuguese = aPlan({ riskAcknowledgedAt: at, riskWordingVersion: 1, riskLanguage: 'pt-PT' });
    for (const other of [null, 'plan', [], portuguese, { schemaVersion: 1 }, { ...portuguese, schemaVersion: 5 }]) {
      expect(upgradePlan(other)).toBe(other);
    }
  });
});

describe('writtenPlan: what main reads back (rollback)', () => {
  it("an English acknowledgement writes main's v3 payload, key for key", () => {
    const plan = english();
    const written = writtenPlan(plan);
    expect(written).toStrictEqual({ schemaVersion: 3, payload: asV3Plan(plan) });
    expect(Object.keys(written.payload).sort()).toEqual(Object.keys(MainPlanV3Schema.shape).sort());
    expect(MainPlanV3Schema.parse(written.payload)).toStrictEqual(written.payload);
  });

  it('nothing recorded writes v2', () => {
    const plan = aPlan();
    const written = writtenPlan(plan);
    expect(written).toStrictEqual({ schemaVersion: 2, payload: asV2Plan(plan) });
    expect(PreviousBuildPlanSchema.parse(written.payload)).toStrictEqual(written.payload);
  });

  it('a pt-PT acknowledgement writes v4', () => {
    const plan = aPlan({ riskAcknowledgedAt: at, riskWordingVersion: 1, riskLanguage: 'pt-PT' });
    const written = writtenPlan(plan);
    expect(written).toStrictEqual({ schemaVersion: 4, payload: plan });
    expect(MainPlanV3Schema.safeParse(written.payload).success).toBe(false);
  });
});

describe('the recorded language in the plan schema', () => {
  it('is a language tag', () => {
    for (const tag of ['en', 'pt-PT', 'de', 'fil', 'es-ES'])
      expect(LanguageTagSchema.safeParse(tag).success).toBe(true);
    for (const tag of ['', 'EN', 'pt-pt', 'pt_PT', 'english', 'pt-PTX']) {
      expect(LanguageTagSchema.safeParse(tag).success).toBe(false);
    }
  });

  it('is null exactly when nothing is recorded', () => {
    expect(PlanSchema.safeParse(english()).success).toBe(true);
    expect(PlanSchema.safeParse(aPlan()).success).toBe(true);
    const codes = (plan: unknown) => PlanSchema.safeParse(plan).error?.issues.map((issue) => issue.message);
    expect(codes({ ...english(), riskLanguage: null })).toEqual(['risk-language']);
    expect(codes({ ...aPlan(), riskLanguage: 'en' })).toEqual(['risk-language']);
    expect(codes({ ...english(), riskLanguage: 'English' })).toBeDefined();
  });
});

describe('property: upgradePlan(writtenPlan(p).payload) gives p back', () => {
  const minute = fc
    .integer({ min: 0, max: 59 })
    .map((m) => instant(`2026-10-22T09:${String(m).padStart(2, '0')}:00.000Z`));
  const language = fc.oneof(fc.constant('en'), fc.constant('pt-PT'), fc.stringMatching(/^[a-z]{2,3}(-[A-Z]{2})?$/));
  // Every consistent pair: nothing recorded with no language, or anything recorded with one.
  const acknowledgement = fc.oneof(
    fc.constant({ riskAcknowledgedAt: null, riskWordingVersion: 0, riskLanguage: null }),
    fc
      .record({ riskAcknowledgedAt: fc.option(minute), riskWordingVersion: fc.nat(20), riskLanguage: language })
      .filter((pair) => pair.riskAcknowledgedAt !== null || pair.riskWordingVersion !== 0),
  );

  it('for every consistent pair of acknowledgement and language, seeds 1 to 8', () => {
    for (let seed = 1; seed <= 8; seed++) {
      fc.assert(
        fc.property(acknowledgement, (pair) => {
          const plan = aPlan(pair);
          expect(PlanSchema.safeParse(plan).success).toBe(true);
          expect(upgradePlan(writtenPlan(plan).payload)).toStrictEqual(plan);
        }),
        { seed, numRuns: 100 },
      );
    }
  });
});
