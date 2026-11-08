// @vitest-environment jsdom
import { countryRules, loadProfile } from '@proofofcalm/content';
import { type CalendarDate, type CountryCode, type Entry, type Plan, textCell } from '@proofofcalm/core';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { userEvent } from 'storybook/test';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '../../../lib/i18n';
import type { Snapshot } from '../../../lib/ports';
import { ServicesProvider } from '../../../lib/services';
import { fixtureNowMs, fixtureSnapshot } from '../../../lib/services/fixtures';
import { createTestServices, preloadLazyModules, recordingPlatform } from '../../../lib/services/testing';
import errors from '../../../messages/en/errors.json';
import settings from '../../../messages/en/settings.json';
import gbFile from '../fixtures/tax-year-2026-27-GB.csv?raw';
import ptFile from '../fixtures/tax-year-2026-PT.csv?raw';
import { TaxYearExport } from './tax-year-export';

// The tax-year export under Your data (docs/DOMAIN.md §3.13): the years of the plan's country, the file of the
// chosen one with the header lines the app words, and nothing for the models it does not export yet.

// `gate.held` holds the profiles back, as on a device that has not read them yet: none is known, and a load waits.
const gate = vi.hoisted(() => ({ held: null as Promise<void> | null }));
vi.mock('@proofofcalm/content', async (original) => {
  const content = await (await import('../../../lib/services/testing-modules')).profilesInMemory(
    await original<typeof import('@proofofcalm/content')>(),
  );
  return {
    ...content,
    loadedProfile: (code: string) => (gate.held === null ? content.loadedProfile(code) : null),
    loadProfile: async (code: string) => {
      if (gate.held !== null) await gate.held;
      return content.loadProfile(code);
    },
  };
});

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

type MountOptions = { load?: typeof rules; nowMs?: number };

async function mountServices(snapshot: Snapshot, { load = rules, nowMs }: MountOptions = {}) {
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
  return { platform, services };
}

async function mount(snapshot: Snapshot, options: MountOptions = {}) {
  return (await mountServices(snapshot, options)).platform;
}

/** A promise the test settles. */
function deferred<T>() {
  let settle: (value: T) => void = () => {};
  const promise = new Promise<T>((resolve) => {
    settle = resolve;
  });
  return { promise, settle };
}

// Base UI names the select a render after it shows (its label registers its id in an effect): queries wait for it.
const yearSelect = () => screen.findByRole('combobox', { name: 'Tax year' });

/** Opens the select and returns its options' text. */
async function options() {
  await userEvent.setup({ document }).click(await yearSelect());
  return (await screen.findAllByRole('option')).map((option) => option.textContent);
}

/** Exports the year shown in the select (or the option named `year` once chosen) and returns the one file saved. */
async function exportYear(platform: ReturnType<typeof recordingPlatform>, year?: string) {
  const select = await yearSelect();
  if (year !== undefined) {
    const user = userEvent.setup({ document });
    await user.click(select);
    await user.click(await screen.findByRole('option', { name: year }));
  }
  await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Export tax-year CSV' })));
  expect(platform.calls.downloads).toHaveLength(1);
  return platform.calls.downloads[0] as { name: string; content: string; type: string };
}

const headerOf = (content: string) => content.slice(0, content.indexOf('\n\n'));
const lines = (...header: string[]) => header.map(textCell).join('\n');

const PT_SOURCES =
  'https://info.portaldasfinancas.gov.pt/pt/informacao_fiscal/codigos_tributarios/cirs_rep/Pages/irs43.aspx, ' +
  'https://info.portaldasfinancas.gov.pt/pt/informacao_fiscal/codigos_tributarios/cirs_rep/Pages/irs10.aspx';
const NOT_LOADED =
  "Your country's rules are not loaded on this device. Reload the page when you are online to export a tax year.";
const HELD_EMPTY = 'On a held row, an empty cost_basis means no cost was recorded, not a cost of zero.';
const EMPTY_COST = `${HELD_EMPTY} Rows with no acquired date leave cost_basis empty.`;
const EMPTY_COST_RAW = `${HELD_EMPTY} Sale rows leave cost_basis empty.`;

/** The file's rows as cells by column; the test data puts no comma, quote or line break in a cell. */
function rowsOf(content: string): Record<string, string>[] {
  const [columns = '', ...rows] = content
    .slice(content.indexOf('\n\n') + 2)
    .replaceAll('\r', '')
    .trimEnd()
    .split('\n');
  const names = columns.split(',');
  return rows.map((row) => Object.fromEntries(row.split(',').map((cell, index) => [names[index], cell])));
}

/** A held entry of `units` BTC with no recorded cost on `on`. */
const heldNoCost = (all: readonly Entry[], on: string, units: string): Entry => ({
  ...(all[0] as Entry),
  id: 'b0000000-0000-4000-8000-000000000002' as Entry['id'],
  kind: 'held',
  date: on as CalendarDate,
  units: units as Entry['units'],
  amount: null,
});

describe('TaxYearExport', () => {
  it('lists the tax years newest first, GB as 2026 to 2027', async () => {
    await mount(withPlan({ country: 'GB' as Plan['country'], payCurrency: 'GBP' }));
    expect(await options()).toEqual(['2026 to 2027 (still running)', '2025 to 2026']);
  });

  it('preselects the latest ended year', async () => {
    await mount(withPlan({}, (all) => [...yearEarlier(all), ...all]));
    const shown = (await yearSelect()).querySelector('[data-slot="select-value"]');
    expect(shown?.textContent).toBe('2025');
    expect(await options()).toEqual(['2026 (still running)', '2025']);
  });

  it('with a first buy today, offers only the running year, marked as running', async () => {
    await mount(
      withPlan({}, (all) => all.slice(0, 1).map((entry) => ({ ...entry, date: '2026-10-20' as CalendarDate }))),
    );
    expect(await options()).toEqual(['2026 (still running)']);
  });

  it('with no entries, says there is no tax year to export', async () => {
    await mount(withPlan({}, () => []));
    expect(await screen.findByText('No entries yet, so there is no tax year to export.')).toBeTruthy();
    expect(screen.queryByRole('button')).toBeNull();
  });

  it("without the country's rules, says so and offers no control", async () => {
    await mount(fixtureSnapshot(), { load: async () => null });
    expect(await screen.findByText(NOT_LOADED)).toBeTruthy();
    expect(screen.queryByRole('combobox')).toBeNull();
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('while the profile loads, says nothing, then offers the select', async () => {
    const pt = await rules('PT');
    const profiles = deferred<void>();
    gate.held = profiles.promise;
    try {
      await mount(fixtureSnapshot(), { load: async () => pt });
      await act(async () => {});
      expect(screen.queryByText(NOT_LOADED)).toBeNull();
      expect(screen.queryByRole('combobox')).toBeNull();
      gate.held = null;
      await act(async () => profiles.settle());
      expect(await yearSelect()).toBeTruthy();
    } finally {
      gate.held = null;
      profiles.settle();
    }
  });

  it("while a change of country loads the new country's rules, says nothing, then offers its years", async () => {
    const gb = deferred<Awaited<ReturnType<typeof rules>>>();
    const { services } = await mountServices(fixtureSnapshot(), {
      load: (code) => (code === 'GB' ? gb.promise : rules(code)),
    });
    await yearSelect();
    await act(async () => {
      await services.domain.write(({ plan }) => ({
        plan: { ...(plan as Plan), country: 'GB' as Plan['country'], payCurrency: 'GBP' },
      }));
    });
    expect(screen.queryByText(NOT_LOADED)).toBeNull();
    expect(screen.queryByRole('combobox')).toBeNull();
    await act(async () => gb.settle(await rules('GB')));
    expect(await options()).toEqual(['2026 to 2027 (still running)', '2025 to 2026']);
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
        'Data from your log. Not a tax computation.',
        'Amounts are as you logged them and are not converted. Your pay currency is EUR.',
        `Portugal rules reviewed on 2026-11-05 · general information, not advice · Sources: ${PT_SOURCES}`,
        'Each sale is matched to purchases of the same coin, first in, first out.',
        profile?.lotRuleNote ?? '',
        'eligible_from: the first day past the Portugal holding rule (365 days). past_holding_rule: whether that day had come by the sale, or by 2025-12-31 for units still held. Computed from your dates, not tax advice.',
        ...(profile?.holdingRuleConditions ?? []),
        'Sales are matched per venue as named in the Log. Entries with no venue are one group.',
        'Dates are YYYY-MM-DD. Amounts and units use a decimal point.',
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
    const header = headerOf((await exportYear(platform, '2026 (still running)')).content);
    const note = (await loadProfile('IT'))?.lotRuleNote ?? '';
    expect(note).toMatch(/A cost without proof counts as zero\.$/u);
    expect(header).toContain('Each sale is matched to purchases of the same coin, last in, first out.');
    expect(header).toContain(textCell(note));
    expect(header).toContain(textCell(EMPTY_COST));
    expect(header).not.toContain('eligible_from');
  });

  it("the per-lot file's empty-cost line holds for its held lot with no cost and its unmatched sale", async () => {
    const entries = (all: readonly Entry[]): Entry[] => [
      ...all,
      heldNoCost(all, '2026-02-01', '0.01'),
      {
        ...(all[0] as Entry),
        id: 'b0000000-0000-4000-8000-000000000003' as Entry['id'],
        kind: 'sell',
        date: '2026-10-01' as CalendarDate,
        units: '5' as Entry['units'],
        amount: '1000' as Entry['amount'],
      },
    ];
    const platform = await mount(withPlan({ country: 'IT' as Plan['country'] }, entries));
    const { content } = await exportYear(platform, '2026 (still running)');
    expect(headerOf(content)).toContain(textCell(EMPTY_COST));
    const rows = rowsOf(content);
    const empty = rows.filter((row) => row.cost_basis === '');
    expect(empty.some((row) => row.kind === 'held')).toBe(true);
    expect(empty.some((row) => row.acquired === '')).toBe(true);
    for (const row of empty) expect(row.kind === 'held' || row.acquired === '').toBe(true);
    for (const row of rows.filter((each) => each.acquired === '')) expect(row.cost_basis).toBe('');
  });

  it("the raw listing's empty-cost line holds for its held entry with no cost and its sale", async () => {
    const entries = (all: readonly Entry[]): Entry[] => [...all, heldNoCost(all, '2026-07-01', '0.01')];
    const platform = await mount(withPlan({ country: 'GB' as Plan['country'], payCurrency: 'GBP' }, entries));
    const { content } = await exportYear(platform, '2026 to 2027 (still running)');
    expect(headerOf(content)).toContain(textCell(EMPTY_COST_RAW));
    const rows = rowsOf(content);
    const empty = rows.filter((row) => row.cost_basis === '');
    expect(empty.some((row) => row.kind === 'held')).toBe(true);
    expect(empty.some((row) => row.kind === 'sell')).toBe(true);
    for (const row of empty) expect(['held', 'sell']).toContain(row.kind);
    for (const row of rows.filter((each) => each.kind === 'sell')) expect(row.cost_basis).toBe('');
  });

  it('under review, the file quotes no rule words', async () => {
    const platform = await mount(withPlan({}, yearEarlier), { nowMs: Date.parse('2029-01-01T10:00:00Z') });
    const header = headerOf((await exportYear(platform, '2025')).content);
    const profile = await loadProfile('PT');
    expect(header).toContain('Portugal rules not reviewed since 2026-11-05 · general information, not advice');
    expect(header).not.toContain('Sources');
    expect(header).not.toContain(profile?.lotRuleNote);
    for (const condition of profile?.holdingRuleConditions ?? []) expect(header).not.toContain(condition);
  });

  it('a plan in USD under Portugal says the amounts are not converted', async () => {
    const platform = await mount(withPlan({ payCurrency: 'USD', displayCurrency: 'USD' }, yearEarlier));
    const header = headerOf((await exportYear(platform)).content);
    expect(header).toContain('Amounts are as you logged them and are not converted to EUR. Your pay currency is USD.');
  });

  it('after a change of country, no header line claims the amounts are in the new pay currency', async () => {
    // The store dates no change of currency (#272): amounts logged before it keep the old one.
    const platform = await mount(withPlan({ country: 'GB' as Plan['country'], payCurrency: 'GBP' }));
    const header = headerOf((await exportYear(platform, '2026 to 2027 (still running)')).content);
    expect(header).toContain('Amounts are as you logged them and are not converted. Your pay currency is GBP.');
    expect(header).not.toMatch(/Amounts (are )?in GBP/u);
    expect(header).not.toMatch(/in (your|the) pay currency/u);
  });

  it('the UK file is the raw listing, with the pool and the 30-day window named', async () => {
    const platform = await mount(withPlan({ country: 'GB' as Plan['country'], payCurrency: 'GBP' }));
    const file = await exportYear(platform, '2026 to 2027 (still running)');
    expect(file.name).toBe('proof-of-calm-tax-year-2026-27-GB-2026-10-20.csv');
    const header = headerOf(file.content);
    expect(header).toContain(
      'Sales are not matched to purchases in this file. The pooling or matching is for your accountant.',
    );
    expect(header).toContain(
      'For a coin sold in the tax year, every purchase and sale to 2027-04-05 is listed for the pool. Its purchases to 2027-05-05 are listed for the 30-day rule.',
    );
    expect(header).toContain('Made on 2026-10-20: purchases after that day are not in this file.');
    expect(header).toContain('The tax year ends on 2027-04-05. This file shows your log as of 2026-10-20.');
    expect(file.content).toContain('\n\nkind,date,coin,venue,units,cost_basis,fee,eligible_from,proceeds,');
  });

  // The expected files the e2e spec also reads (apps/web/e2e/tax-year.spec.ts), byte for byte from the same seed and clock,
  // so a change of wording or rows fails here before the viewport matrix runs.
  it.each([
    ['PT', {}, '2026 (still running)', ptFile],
    [
      'GB',
      { country: 'GB', payCurrency: 'GBP', displayCurrency: 'GBP', holdingRule: { kind: 'none' } },
      '2026 to 2027 (still running)',
      gbFile,
    ],
  ] as const)('the %s file is the e2e fixture', async (_, patch, year, expected) => {
    const platform = await mount(withPlan(patch as Partial<Plan>), { nowMs: fixtureNowMs('buy') });
    expect((await exportYear(platform, year)).content).toBe(expected);
  });

  // A spreadsheet that splits on `;` (the de and pt locales) would cut a header cell in two.
  const noSemicolon = (content: string) => {
    for (const cell of headerOf(content).split('\n')) expect(cell).not.toContain(';');
  };

  it('no header cell of an expected file holds a semicolon', () => {
    noSemicolon(ptFile);
    noSemicolon(gbFile);
  });

  it('with every flag set, no header cell of either file holds a semicolon', async () => {
    const entry = (all: readonly Entry[], id: string, patch: Partial<Entry>): Entry => ({
      ...(all[0] as Entry),
      id: `c0000000-0000-4000-8000-00000000000${id}` as Entry['id'],
      ...patch,
    });
    const flagged = (all: readonly Entry[]): Entry[] => [
      ...all.map((each, index) => (index === 1 ? { ...each, source: 'one-tap' as const } : each)),
      heldNoCost(all, '2026-02-01', '0.01'),
      entry(all, '1', { kind: 'extra', date: '2026-03-01' as CalendarDate, venue: 'Ledger' }),
      entry(all, '2', {
        kind: 'sell',
        date: '2026-03-15' as CalendarDate,
        venue: 'Bitvavo',
        units: '0.001' as Entry['units'],
      }),
      entry(all, '3', { kind: 'sell', date: '2026-10-01' as CalendarDate, units: '5' as Entry['units'] }),
    ];
    const pt = await mount(withPlan({ holdingRule: { kind: 'none' } }, flagged));
    const lots = (await exportYear(pt, '2026 (still running)')).content;
    const flags = [
      'sale_venue shows',
      'its own holding rule',
      'is a sale',
      "units_estimated yes: Proof of Calm's Bought as planned button filled in",
      'ends on 2026-12-31',
    ];
    for (const words of flags) expect(headerOf(lots)).toContain(words);
    expect(headerOf(lots)).toContain(textCell(EMPTY_COST));
    noSemicolon(lots);
    cleanup();
    const gb = await mount(withPlan({ country: 'GB' as Plan['country'], payCurrency: 'GBP' }, flagged));
    const pool = (await exportYear(gb, '2026 to 2027 (still running)')).content;
    expect(headerOf(pool)).toContain(textCell(EMPTY_COST_RAW));
    noSemicolon(pool);
  });

  it("no line of the app's own header copy holds a semicolon, whichever the code picks", () => {
    for (const line of Object.values(settings.data.taxYear.file)) expect(line).not.toContain(';');
  });
});
