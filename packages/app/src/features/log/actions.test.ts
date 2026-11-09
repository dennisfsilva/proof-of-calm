import { type CountryRules, changeCountry, changePayCurrency, type Plan } from '@proofofcalm/core';
import { FIXTURE_RULES } from '@proofofcalm/core/testing/country-change';
import { describe, expect, it } from 'vitest';
import { fixtureSnapshot } from '../../lib/services/fixtures';
import { createTestServices } from '../../lib/services/testing';
import { logActions } from './actions';

// The Log's delete Undo across a change of the plan's pay currency (docs/DOMAIN.md §6, Delete entry; ADR-0053):
// amounts typed in euros never come back to read as pounds while the toast is still open. The changes are written as
// Settings' changeCountryOf and changePayCurrencyOf store them (a feature reaches another only through its index).
describe("the Log's delete Undo after the pay currency moved", () => {
  const uk = { ...FIXTURE_RULES.DE, code: 'GB' as Plan['country'], currency: 'GBP' as const };
  const started = async (fields: Partial<Plan> = {}) => {
    const snapshot = fixtureSnapshot();
    const services = createTestServices({ snapshot: { ...snapshot, plan: { ...(snapshot.plan as Plan), ...fields } } });
    await services.start();
    return services;
  };
  type Started = Awaited<ReturnType<typeof started>>;
  const state = (services: Started) => services.domain.store.getState().snapshot;
  const live = (services: Started) => state(services).entries.filter((entry) => entry.deletedAt === null);
  const deleteAll = async (services: Started) => {
    const ids = live(services).map((entry) => entry.id);
    const deleted = await logActions(services).deleteTransaction(ids);
    if (!deleted.ok) throw new Error('the delete ran');
    return { ids, before: deleted.value };
  };
  /** changeCountryOf with no question to ask (no live entry is left): the currencies follow the country. */
  const moveTo = (services: Started, rules: CountryRules) =>
    services.domain.write(({ plan }) => ({
      plan: changeCountry(plan as Plan, rules, services.clock.now(), 'country').plan,
    }));

  it('refuses the undo after a change of country to another currency, restoring nothing', async () => {
    const services = await started();
    const { ids, before } = await deleteAll(services);
    expect(ids.length).toBeGreaterThan(0);
    await moveTo(services, uk);
    const plan = state(services).plan;
    expect(plan).toMatchObject({ country: 'GB', payCurrency: 'GBP' });
    expect(await logActions(services).undoDelete(ids, before)).toEqual({
      ok: false,
      error: { code: 'currency-changed', from: 'EUR', to: 'GBP' },
    });
    expect(live(services)).toEqual([]);
    expect(state(services).plan).toBe(plan);
  });

  it("refuses the undo after Currency & data's change of the pay currency, restoring nothing", async () => {
    const services = await started({ country: 'GB' as Plan['country'] });
    const { ids, before } = await deleteAll(services);
    await services.domain.write(({ plan }) => ({
      plan: { ...changePayCurrency(plan as Plan, 'GBP', services.clock.now()), displayCurrency: 'GBP' },
    }));
    const plan = state(services).plan;
    expect(await logActions(services).undoDelete(ids, before)).toEqual({
      ok: false,
      error: { code: 'currency-changed', from: 'EUR', to: 'GBP' },
    });
    expect(live(services)).toEqual([]);
    expect(state(services).plan).toBe(plan);
  });

  it('restores every entry when the country changes and the currency stays', async () => {
    const services = await started();
    const { ids, before } = await deleteAll(services);
    await moveTo(services, FIXTURE_RULES.DE);
    expect(state(services).plan).toMatchObject({ country: 'DE', payCurrency: 'EUR' });
    const restored = await logActions(services).undoDelete(ids, before);
    expect(restored.ok && restored.value.length).toBe(ids.length);
    expect(live(services)).toHaveLength(ids.length);
  });
});
