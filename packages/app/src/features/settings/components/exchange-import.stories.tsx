import {
  type EntityId,
  type Entry,
  type Instant,
  MAX_ENTRIES,
  type Plan,
  planExchangeImport,
  readExchangeFile,
} from '@proofofcalm/core';
import { anEntry, date, units } from '@proofofcalm/core/testing';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, userEvent, within } from 'storybook/test';
import { memoryPlanStore } from '../../../lib/adapters/memory-store';
import type { PlanStore, Snapshot } from '../../../lib/ports';
import { fixtureNowMs, fixtureSnapshot } from '../../../lib/services/fixtures';
import { KRAKEN_OCTOBER, ONE_TAP_OCTOBER } from '../../../lib/services/kraken.testing';
import { createTestServices } from '../../../lib/services/testing';
import { exchangeContext } from '../model/import';
import { ExchangeImport } from './exchange-import';
import { type ExchangeProblem, useExchangeProblemText } from './exchange-problem';

// The exchange import's container over the fixture plan, from a synthetic Kraken ledger (ADR-0056): the preview with
// the held line unticked and ticked, a file imported before with nothing to add, a write refused because the Log
// changed, and the lines of the refusals that end the preview. The test projects of vitest.config.ts check each at
// 360 and 1280 px, light and dark, with axe.

const read = readExchangeFile(KRAKEN_OCTOBER);
if (!read.ok) throw new Error('the synthetic ledger reads');
const FILE = read.value;
const fixture = fixtureSnapshot();
/** Coins added at Ledger on 13 Oct, after both of the ledger's BTC purchases (invented). */
const HELD = anEntry({
  id: 'aaaaaaaa-0000-4000-8000-000000000020' as EntityId,
  kind: 'held',
  coin: 'BTC' as Entry['coin'],
  date: date('2026-10-13'),
  amount: null,
  units: units('0.002'),
  slot: null,
  venue: 'Ledger',
  source: 'manual',
});
const withEntries = (extra: readonly Entry[]): Snapshot => ({ ...fixture, entries: [...fixture.entries, ...extra] });

const meta = {
  title: 'Features/Settings/ExchangeImport',
  component: ExchangeImport,
  args: { file: FILE, name: 'kraken-ledgers.csv', onDone: fn() },
  parameters: { path: '/settings', snapshot: withEntries([ONE_TAP_OCTOBER, HELD]), nowMs: fixtureNowMs('buy') },
} satisfies Meta<typeof ExchangeImport>;

export default meta;

type Story = StoryObj<typeof meta>;

export const HeldNotAdded: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('heading', { name: 'What this file adds' })).toBeVisible();
    await expect(canvas.getByText(/They are not added unless you choose so\./)).toBeVisible();
    await expect(canvas.getByRole('checkbox', { name: 'Add these purchases too' })).not.toBeChecked();
  },
};

export const HeldAdded: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('checkbox', { name: 'Add these purchases too' }));
    await userEvent.click(canvas.getByRole('button', { name: 'Estimates it replaces (1)' }));
    await expect(canvas.getByText('Replaces 1 estimate from Bought as planned.')).toBeVisible();
  },
};

/** The fixture's Log with this file imported before: every row is counted as imported earlier. */
const importedBefore = planExchangeImport(
  FILE,
  { plan: fixture.plan as Plan, entries: fixture.entries },
  { venue: 'Kraken', addHeld: false },
  exchangeContext('2026-10-20' as Entry['date'], '2026-10-20T10:00:00.000Z' as Instant, 'Europe/Lisbon'),
).entries;

export const NothingToAdd: Story = {
  parameters: { snapshot: { ...fixture, entries: [...fixture.entries, ...importedBefore] } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText('Nothing to add from this file.')).toBeVisible();
    await expect(canvas.queryByRole('button', { name: /^Import/ })).toBeNull();
  },
};

/** The store the Changed story's services read, so its play can write as another tab would. */
let changedStore: PlanStore | null = null;

export const LogChanged: Story = {
  parameters: {
    services: () => {
      changedStore = memoryPlanStore(withEntries([HELD]));
      return createTestServices({ planStore: changedStore, nowMs: fixtureNowMs('buy') });
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await canvas.findByRole('heading', { name: 'What this file adds' });
    await changedStore?.write({ entries: [ONE_TAP_OCTOBER] });
    await userEvent.click(canvas.getByRole('button', { name: /^Import \d+ entr/ }));
    await expect(await canvas.findByRole('alert')).toHaveFocus();
  },
};

/** The refusals that end the preview, as the section's alert words them. */
function RefusalLines({ problems }: { readonly problems: readonly ExchangeProblem[] }) {
  const text = useExchangeProblemText();
  return (
    <div className="flex flex-col gap-stack-sm">
      {problems.map((problem) => (
        <p key={problem.code}>{text(problem)}</p>
      ))}
    </div>
  );
}

export const Refusals: Story = {
  render: () => (
    <RefusalLines
      problems={[
        { code: 'newer-rows' },
        { code: 'no-plan' },
        { code: 'too-many-entries', entries: MAX_ENTRIES + 4, max: MAX_ENTRIES },
        { code: 'invalid-entries', ids: ['a' as EntityId, 'b' as EntityId] },
      ]}
    />
  ),
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByText(/so nothing was imported\. Set up a plan/)).toBeVisible();
  },
};
