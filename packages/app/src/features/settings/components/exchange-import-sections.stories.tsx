import {
  type Entry,
  type ExchangeId,
  type ExchangeImportPlan,
  type ImportRemedies,
  type Instant,
  importRemedies,
  type Plan,
  planExchangeImport,
  readExchangeFile,
} from '@proofofcalm/core';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent } from 'storybook/test';
import { fixtureNowMs, fixtureSnapshot } from '../../../lib/services/fixtures';
import { KRAKEN_LEFT_OUT, KRAKEN_OCTOBER, krakenLedger, ONE_TAP_OCTOBER } from '../../../lib/services/kraken.testing';
import { TRADE_REPUBLIC_OCTOBER } from '../../../lib/services/trade-republic.testing';
import { previewModel } from '../model/exchange-preview';
import { exchangeContext } from '../model/import';
import { ExchangeSections, ExchangeSummary } from './exchange-import-sections';

// The exchange import's preview sections over the fixture plan, from synthetic Kraken ledgers and a synthetic Trade
// Republic export (ADR-0056): an import that replaces an estimate, one that fills October's months, one the Log
// records already, one with an item that says to delete its entry and one that does not, one whose rows are all left
// out, a purchase the file cannot tell from the starting amount the Log holds, Trade Republic's rows left out in its
// words, and a file imported
// before, with nothing to add. Each play opens its sections, so the test projects of
// vitest.config.ts check the open lists at 360 and 1280 px, light and dark, with axe.

const fixture = fixtureSnapshot();
const PLAN = fixture.plan as Plan;
const CONTEXT = exchangeContext('2026-10-20' as Entry['date'], '2026-10-20T10:00:00.000Z' as Instant, 'Europe/Lisbon');
const planOf = (csv: string, entries: readonly Entry[], venue = 'Kraken'): ExchangeImportPlan => {
  const read = readExchangeFile(csv);
  if (!read.ok) throw new Error('the synthetic ledger reads');
  return planExchangeImport(read.value, { plan: PLAN, entries }, { venue, addHeld: false }, CONTEXT);
};

const remediesOf = (csv: string, entries: readonly Entry[]) => {
  const read = readExchangeFile(csv);
  if (!read.ok) throw new Error('the synthetic ledger reads');
  return importRemedies(read.value, { plan: PLAN, entries }, false, CONTEXT);
};

function Preview({
  shown,
  exchange = 'kraken',
  remedies,
}: {
  shown: ExchangeImportPlan;
  exchange?: ExchangeId;
  remedies?: ImportRemedies;
}) {
  const model = previewModel(shown, shown, remedies);
  return (
    <div className="flex flex-col gap-stack-sm">
      <ExchangeSummary model={model} plan={PLAN} />
      <ExchangeSections model={model} plan={PLAN} exchange={exchange} />
    </div>
  );
}

const meta = {
  title: 'Features/Settings/ExchangeImportSections',
  component: Preview,
  parameters: { path: '/settings', snapshot: fixture, nowMs: fixtureNowMs('buy') },
} satisfies Meta<typeof Preview>;

export default meta;

type Story = StoryObj<typeof meta>;

const typed: Entry = {
  ...ONE_TAP_OCTOBER,
  id: 'aaaaaaaa-0000-4000-8000-000000000030' as Entry['id'],
  units: '0.00121' as Entry['units'],
  source: 'manual',
};
const imported = planOf(KRAKEN_OCTOBER, fixture.entries).entries;

export const ReplacesAnEstimate: Story = {
  args: { shown: planOf(KRAKEN_OCTOBER, [...fixture.entries, ONE_TAP_OCTOBER]) },
  play: async ({ canvas }) => {
    await expect(canvas.getByText('Replaces 1 estimate from Bought as planned.')).toBeVisible();
    for (const name of ['Monthly buys (1)', 'Estimates it replaces (1)', 'Sales (1)', 'Coins added at no cost (1)'])
      await userEvent.click(canvas.getByRole('button', { name }));
    await expect(canvas.getByRole('list', { name: 'Sales (1)' })).toBeVisible();
  },
};

export const FillsTheMonths: Story = {
  args: { shown: planOf(KRAKEN_OCTOBER, fixture.entries) },
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getByRole('button', { name: 'Monthly buys (3)' }));
    await expect(canvas.getByRole('list', { name: 'Monthly buys (3)' })).toBeVisible();
  },
};

export const RecordedAlready: Story = {
  args: { shown: planOf(KRAKEN_OCTOBER, [...fixture.entries, typed]) },
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getByRole('button', { name: 'Matching entries in the Log, not added (1)' }));
    await expect(canvas.getByRole('list', { name: 'Matching entries in the Log, not added (1)' })).toBeVisible();
  },
};

// A monthly buy whose row may be deleted to import the file's, with the sentence, and a starting amount without it.
const lump: Entry = {
  ...typed,
  id: 'aaaaaaaa-0000-4000-8000-000000000032' as Entry['id'],
  kind: 'lump',
  coin: 'ETH' as Entry['coin'],
  slot: null,
  amount: '30' as Entry['amount'],
  units: '0.0121' as Entry['units'],
};
const both = [...fixture.entries, typed, lump];

export const RecordedWithAndWithoutTheSentence: Story = {
  args: { shown: planOf(KRAKEN_OCTOBER, both), remedies: remediesOf(KRAKEN_OCTOBER, both) },
  play: async ({ canvas }) => {
    const name = 'Matching entries in the Log, not added (2)';
    await userEvent.click(canvas.getByRole('button', { name }));
    const items = canvas.getAllByRole('listitem').map((item) => item.textContent ?? '');
    const sentence =
      "To import the file's transaction instead, delete that entry in the Log, then choose the file again.";
    await expect(items.map((text) => text.endsWith(sentence))).toEqual([true, false]);
    // Its own line at the end of the item, in the secondary ink.
    await expect(canvas.getByText(sentence)).toHaveClass('block', 'text-ink-2');
  },
};

export const LeftOut: Story = {
  args: { shown: planOf(KRAKEN_LEFT_OUT, []) },
  play: async ({ canvas }) => {
    await expect(canvas.getByText('Nothing to add from this file.')).toBeVisible();
    await userEvent.click(canvas.getByRole('button', { name: 'Left out (11)' }));
    await expect(canvas.getByRole('list', { name: 'Left out (11)' })).toBeVisible();
  },
};

/** The starting amount the fixture's Log holds in two lumps, and a purchase of 20 Mar the file cannot tell from it. */
const march20 = krakenLedger([
  ['S1', '2026-03-20 09:00:00', 'trade', 'EUR', '-700.0000', '0.0000'],
  ['S1', '2026-03-20 09:00:00', 'trade', 'BTC', '0.0125000000', '0.0000000000'],
]);

export const StartingAmountInTheLog: Story = {
  args: { shown: planOf(march20, fixture.entries) },
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getByRole('button', { name: 'Left out (1)' }));
    await expect(canvas.getByText(/0\.0125 BTC for €700\.00 on 20 Mar 2026/)).toBeVisible();
    await expect(canvas.getByText(/which the Log holds as 0\.0125 BTC for €700\.00 on 5 Apr 2026/)).toBeVisible();
  },
};

export const TradeRepublicLeftOut: Story = {
  args: { shown: planOf(TRADE_REPUBLIC_OCTOBER, [], 'Trade Republic'), exchange: 'trade-republic' },
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getByRole('button', { name: 'Left out (8)' }));
    await expect(canvas.getByText(/Saveback cash credit, not imported/)).toBeVisible();
  },
};

export const NothingToAdd: Story = {
  args: { shown: planOf(KRAKEN_OCTOBER, [...fixture.entries, ...imported]) },
  play: async ({ canvas }) => {
    await expect(canvas.getByText('Nothing to add from this file.')).toBeVisible();
    await expect(canvas.getByText('Imported earlier, not added: 5.')).toBeVisible();
    await expect(canvas.queryByRole('button')).toBeNull();
  },
};
