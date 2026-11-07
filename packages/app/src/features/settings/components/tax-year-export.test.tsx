// @vitest-environment jsdom
import { countryRules, loadProfile } from '@proofofcalm/content';
import { type CalendarDate, type CountryCode, type Entry, type Plan, textCell } from '@proofofcalm/core';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import gbFile from '../../../../../../apps/web/e2e/fixtures/tax-year-2026-27-GB.csv?raw';
import ptFile from '../../../../../../apps/web/e2e/fixtures/tax-year-2026-PT.csv?raw';
import { I18nProvider } from '../../../lib/i18n';
import type { Snapshot } from '../../../lib/ports';
import { ServicesProvider } from '../../../lib/services';
import { fixtureNowMs, fixtureSnapshot } from '../../../lib/services/fixtures';
import { createTestServices, preloadLazyModules, recordingPlatform } from '../../../lib/services/testing';
import errors from '../../../messages/en/errors.json';
import settings from '../../../messages/en/settings.json';
import { TaxYearExport } from './tax-year-export';

// The tax-year export under Your data (docs/DOMAIN.md §3.13): the years of the plan's country, the file of the
// chosen one with the header lines the app words, and nothing for the models it does not export yet.

vi.mock('@proofofcalm/content', async (original) =>
  (await import('../../../lib/services/testing-modules')).profilesInMemory(
    await original<typeof import('@proofofcalm/content')>(),
  ),
);

afterEach(cleanup);
await preloadLazyModules();

const rules = async (code: CountryCode) => {
  const profile = await loadProfile(code);
  return profile === null ? null : countryRules(profile);
};

/** The fixture with its plan patched and, with `entries`, its entries replaced. */
function withPlan(patch: Partial<Plan>, entries?: (all: readonly Entry[]) => Entry[]): Snapshot {
  const snapshot = fixtureSnapshot();
  return {
    ...snapshot,
    plan: { ...(snapshot.plan as Plan), ...patch },
    entries: entries === undefined ? snapshot.entries : entries(snapshot.entries),
  };
}

/** The fixture's entries a year earlier, so 2025 has ended on the test clock's 2026-10-20. */
const yearEarlier = (all: readonly Entry[]) =>
  all.map((entry) => ({ ...entry, date: entry.date.replace('2026-', '2025-') as CalendarDate }));

async function mount(snapshot: Snapshot, { load = rules, nowMs }: { load?: typeof rules; nowMs?: number } = {}) {
  const platform = recordingPlatform();
  const services = createTestServices({ snapshot, platform, rules: load, ...(nowMs === undefined ? {} : { nowMs }) });
  await services.start();
  render(
    <ServicesProvider services={services}>
      <I18nProvider messages={{ settings, errors }}>
        <TaxYearExport />
      </I18nProvider>
    </ServicesProvider>,
  );
  return platform;
}

const options = () => screen.getAllByRole('option').map((option) => option.textContent);

/** Exports the year shown in the select (or `year` once chosen) and returns the one file saved. */
async function exportYear(platform: ReturnType<typeof recordingPlatform>, year?: string) {
  const select = await screen.findByLabelText('Tax year');
  if (year !== undefined) fireEvent.change(select, { target: { value: year } });
  await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Export tax-year CSV' })));
  expect(platform.calls.downloads).toHaveLength(1);
  return platform.calls.downloads[0] as { name: string; content: string; type: string };
}

const headerOf = (content: string) => content.slice(0, content.indexOf('\n\n'));
const lines = (...header: string[]) => header.map(textCell).join('\n');

const PT_SOURCES =
  'https://info.portaldasfinancas.gov.pt/pt/informacao_fiscal/codigos_tributarios/cirs_rep/Pages/irs43.aspx, ' +
  'https://info.portaldasfinancas.gov.pt/pt/informacao_fiscal/codigos_tributarios/cirs_rep/Pages/irs10.aspx';
const EMPTY_COST = 'An empty cost_basis is a purchase with no recorded cost, not a cost of zero.';

describe('TaxYearExport', () => {
  it('lists the tax years newest first, GB as 2026 to 2027', async () => {
    await mount(withPlan({ country: 'GB' as Plan['country'], payCurrency: 'GBP' }));
    await screen.findByLabelText('Tax year');
    expect(options()).toEqual(['2026 to 2027 (still running)', '2025 to 2026']);
  });

  it('preselects the latest ended year', async () => {
    await mount(withPlan({}, (all) => [...yearEarlier(all), ...all]));
    const select = (await screen.findByLabelText('Tax year')) as HTMLSelectElement;
    expect(options()).toEqual(['2026 (still running)', '2025']);
    expect(select.value).toBe('2025');
  });

  it('with a first buy today, offers only the running year, marked as running', async () => {
    await mount(
      withPlan({}, (all) => all.slice(0, 1).map((entry) => ({ ...entry, date: '2026-10-20' as CalendarDate }))),
    );
    await screen.findByLabelText('Tax year');
    expect(options()).toEqual(['2026 (still running)']);
  });

  it('with no entries, says there is no tax year to export', async () => {
    await mount(withPlan({}, () => []));
    expect(await screen.findByText('No entries yet, so there is no tax year to export.')).toBeTruthy();
    expect(screen.queryByRole('button')).toBeNull();
  });

  it("without the country's rules, says so and offers no control", async () => {
    await mount(fixtureSnapshot(), { load: async () => null });
    expect(
      await screen.findByText(
        "Your country's rules are not loaded on this device. Reload the page when you are online to export a tax year.",
      ),
    ).toBeTruthy();
    expect(screen.queryByRole('combobox')).toBeNull();
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('is absent for France and the Netherlands', async () => {
    for (const country of ['FR', 'NL']) {
      await mount(withPlan({ country: country as Plan['country'] }));
      // The profile loads after the rules; a tick lets anything it would show render.
      await act(async () => {});
      expect(document.body.textContent).toBe('');
      cleanup();
    }
  });

  it('downloads proof-of-calm-tax-year-2025-PT-<today>.csv with the header lines', async () => {
    const platform = await mount(withPlan({}, yearEarlier));
    const file = await exportYear(platform);
    expect(file.name).toBe('proof-of-calm-tax-year-2025-PT-2026-10-20.csv');
    expect(file.type).toBe('text/csv');
    const profile = await loadProfile('PT');
    expect(headerOf(file.content)).toBe(
      lines(
        'Proof of Calm tax-year file · Portugal · 2025-01-01 to 2025-12-31',
        'Data from your log, in your pay currency. Not a tax computation.',
        'Amounts are as you logged them and are not converted. Your pay currency is EUR.',
        `Rules for Portugal reviewed on 2026-11-05 · general information, not advice · Sources: ${PT_SOURCES}`,
        'Each sale is matched to purchases of the same coin, first in, first out.',
        profile?.lotRuleNote ?? '',
        'eligible_from: the first day past the holding rule for Portugal (365 days); past_holding_rule: whether that day had come by the sale, or by 2025-12-31 for units still held. Computed from your dates, not tax advice.',
        ...(profile?.holdingRuleConditions ?? []),
        'Sales are matched per venue as named in the Log; entries with no venue are one group.',
        'Dates are YYYY-MM-DD; amounts and units use a decimal point.',
      ),
    );
    expect(file.content).toContain(
      '\n\nkind,acquired,coin,venue,units,cost_basis,fee,eligible_from,past_holding_rule,',
    );
  });

  it("Italy's file quotes the profile's lot rule note under the empty-cost line", async () => {
    const held = (all: readonly Entry[]): Entry[] => [
      ...yearEarlier(all),
      { ...(all[0] as Entry), id: 'b0000000-0000-4000-8000-000000000001' as Entry['id'], kind: 'held', amount: null },
    ];
    const platform = await mount(withPlan({ country: 'IT' as Plan['country'] }, held));
    const header = headerOf((await exportYear(platform, '2026')).content);
    const note = (await loadProfile('IT'))?.lotRuleNote ?? '';
    expect(note).toMatch(/A cost without proof counts as zero\.$/u);
    expect(header).toContain('Each sale is matched to purchases of the same coin, last in, first out.');
    expect(header).toContain(textCell(note));
    expect(header).toContain(EMPTY_COST);
    expect(header).not.toContain('eligible_from');
  });

  it('under review, the file quotes no rule words', async () => {
    const platform = await mount(withPlan({}, yearEarlier), { nowMs: Date.parse('2029-01-01T10:00:00Z') });
    const header = headerOf((await exportYear(platform, '2025')).content);
    const profile = await loadProfile('PT');
    expect(header).toContain('Rules for Portugal not reviewed since 2026-11-05 · general information, not advice');
    expect(header).not.toContain('Sources');
    expect(header).not.toContain(profile?.lotRuleNote);
    for (const condition of profile?.holdingRuleConditions ?? []) expect(header).not.toContain(condition);
  });

  it('a plan in USD under Portugal says the amounts are not converted', async () => {
    const platform = await mount(withPlan({ payCurrency: 'USD', displayCurrency: 'USD' }, yearEarlier));
    const header = headerOf((await exportYear(platform)).content);
    expect(header).toContain('Amounts are as you logged them and are not converted to EUR. Your pay currency is USD.');
  });

  it('after a change of country, the currency line claims no amount is in the new pay currency', async () => {
    // The store dates no change of currency (#272): amounts logged before it keep the old one.
    const platform = await mount(withPlan({ country: 'GB' as Plan['country'], payCurrency: 'GBP' }));
    const header = headerOf((await exportYear(platform, '2027')).content);
    expect(header).toContain('Amounts are as you logged them and are not converted. Your pay currency is GBP.');
    expect(header).not.toMatch(/Amounts (are )?in GBP/u);
  });

  it('the UK file is the raw listing, with the pool and the 30-day window named', async () => {
    const platform = await mount(withPlan({ country: 'GB' as Plan['country'], payCurrency: 'GBP' }));
    const file = await exportYear(platform, '2027');
    expect(file.name).toBe('proof-of-calm-tax-year-2026-27-GB-2026-10-20.csv');
    const header = headerOf(file.content);
    expect(header).toContain(
      'Sales are not matched to purchases in this file; the pooling or matching is for your accountant.',
    );
    expect(header).toContain(
      'For a coin sold in the tax year, every purchase and sale to 2027-04-05 is listed for the pool, and the purchases to 2027-05-05 for the 30-day rule.',
    );
    expect(header).toContain('Made on 2026-10-20: purchases after that day are not in this file.');
    expect(header).toContain('The tax year ends on 2027-04-05; this file shows your log as of 2026-10-20.');
    expect(file.content).toContain('\n\nkind,date,coin,venue,units,cost_basis,fee,eligible_from,proceeds,');
  });

  // The e2e spec's expected files (apps/web/e2e/tax-year.spec.ts), byte for byte from the same seed and clock,
  // so a change of wording or rows fails here before the viewport matrix runs.
  it.each([
    ['PT', {}, '2026', ptFile],
    [
      'GB',
      { country: 'GB', payCurrency: 'GBP', displayCurrency: 'GBP', holdingRule: { kind: 'none' } },
      '2027',
      gbFile,
    ],
  ] as const)('the %s file is the e2e fixture', async (_, patch, year, expected) => {
    const platform = await mount(withPlan(patch as Partial<Plan>), { nowMs: fixtureNowMs('buy') });
    expect((await exportYear(platform, year)).content).toBe(expected);
  });
});
