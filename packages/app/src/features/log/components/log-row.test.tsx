// @vitest-environment jsdom
import { countryRules, loadProfile } from '@proofofcalm/content';
import {
  type CoinId,
  type Entry,
  holdingContext,
  type Plan,
  type LogRow as Row,
  type TransactionRow,
  transactions,
} from '@proofofcalm/core';
import { aMove, anEntry, units } from '@proofofcalm/core/testing';
import { Table, TableBody } from '@proofofcalm/ui/components/table';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '../../../lib/i18n';
import { type Services, ServicesProvider } from '../../../lib/services';
import { fixtureNowMs, fixtureSnapshot } from '../../../lib/services/fixtures';
import { createTestServices } from '../../../lib/services/testing';
import log from '../../../messages/en/log.json';
import shell from '../../../messages/en/shell.json';
import { LogRow } from './log-row';

// One row of the Log (docs/DOMAIN.md §3.9): a transaction opens to its items, its one holding line and
// the delete button; a skipped month is a line of its own. Portugal's rules, as the browser loads them.

afterEach(cleanup);

const portugal = async () => {
  const profile = await loadProfile('PT');
  return profile === null ? null : countryRules(profile);
};

async function fixtureRows(plan: Plan = fixtureSnapshot().plan as Plan) {
  return transactions(plan, fixtureSnapshot().entries, holdingContext(plan, await portugal())).rows;
}

type Handlers = { note?: boolean; onDelete?: (row: TransactionRow) => void; onEdit?: (row: TransactionRow) => void };

async function mount(row: Row, plan: Plan, options: Handlers = {}) {
  const services: Services = createTestServices({
    snapshot: fixtureSnapshot(),
    nowMs: fixtureNowMs('buy'),
    rules: portugal,
  });
  await act(() => services.start());
  render(
    <ServicesProvider services={services}>
      <I18nProvider messages={{ log, shell }}>
        <Table>
          <TableBody>
            <LogRow
              row={row}
              plan={plan}
              note={options.note ?? false}
              onDelete={options.onDelete ?? (() => undefined)}
              onEdit={options.onEdit ?? (() => undefined)}
            />
          </TableBody>
        </Table>
      </I18nProvider>
    </ServicesProvider>,
  );
}

const plan = fixtureSnapshot().plan as Plan;
const find = (rows: readonly Row[], kind: string) =>
  rows.find((row) => row.type === 'transaction' && row.kind === kind) as TransactionRow;

describe('LogRow', () => {
  it('opens to its items and the delete button, and closes again', async () => {
    const lump = find(await fixtureRows(), 'lump');
    const onDelete = vi.fn();
    await mount(lump, plan, { onDelete });
    const toggle = screen.getByRole('button', { expanded: false });
    expect(toggle.textContent).toContain('Starting amount');
    expect(screen.queryByRole('button', { name: 'Delete entry' })).toBeNull();
    fireEvent.click(toggle);
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    expect(screen.getAllByRole('listitem')).toHaveLength(2);
    fireEvent.click(screen.getByRole('button', { name: 'Delete entry' }));
    expect(onDelete).toHaveBeenCalledWith(lump);
    fireEvent.click(toggle);
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(screen.queryByRole('button', { name: 'Delete entry' })).toBeNull();
  });

  it('says the cost is unknown for coins added with no recorded cost, and names their units alone', async () => {
    const coin = plan.coins[0]?.id as CoinId;
    const held = anEntry({ kind: 'held', slot: null, fee: null, amount: null, coin, units: units('0.5') });
    const row = find(transactions(plan, [held]).rows, 'held');
    expect(row.total).toBeNull();
    await mount(row, plan);
    const cells = screen.getAllByRole('cell');
    expect(cells.at(-1)?.textContent).toBe('Cost unknown');
    fireEvent.click(screen.getByRole('button', { expanded: false }));
    const [item] = screen.getAllByRole('listitem');
    expect(item?.textContent?.replace(/\s/gu, ' ')).toBe('0,50000000 BTC');
    expect(item?.textContent).not.toContain(' for ');
  });

  // ADR-0003: the one tap's units are an estimate from the day's price, labelled until the person edits them.
  const items = async (sources: readonly Entry['source'][]) => {
    const coin = plan.coins[0]?.id as CoinId;
    const bought = sources.map((source, at) =>
      anEntry({ coin, source, amount: `${70 + at}` as Entry['amount'], units: units('0.001') }),
    );
    await mount(find(transactions(plan, bought).rows, 'dca'), plan);
    fireEvent.click(screen.getByRole('button', { expanded: false }));
    return screen.getAllByRole('listitem').map((item) => item.textContent?.replace(/\s/gu, ' '));
  };

  it("labels a one-tap item's units as an estimate", async () => {
    expect(await items(['one-tap'])).toEqual(['0,00100000 BTC (estimated) for 70,00 €']);
  });

  it('a manual or imported item has no label', async () => {
    const shown = await items(['manual', 'import-csv', 'import-json', 'import-prototype']);
    expect(shown).toHaveLength(4);
    for (const item of shown) expect(item).not.toContain('estimated');
  });

  it('shows the figure of coins added at no cost, never the words for an unknown cost', async () => {
    const coin = plan.coins[0]?.id as CoinId;
    const held = anEntry({
      kind: 'held',
      slot: null,
      fee: null,
      amount: '0' as Entry['amount'],
      coin,
      units: units('0.5'),
    });
    await mount(find(transactions(plan, [held]).rows, 'held'), plan);
    expect(screen.getAllByRole('cell').at(-1)?.textContent).toMatch(/^0,00\s€$/u);
  });

  it('keeps its date on one line and marks it with the row key', async () => {
    const lump = find(await fixtureRows(), 'lump');
    await mount(lump, plan);
    const date = screen.getByText('5 Apr 2026');
    expect(date.className.split(' ')).toContain('whitespace-nowrap');
    expect(date.dataset.row).toBe(lump.key);
  });

  // The Log's script focus moves (the row after Show all, the row an Undo restores) land on the toggle, so it carries
  // the scroll margin: the least scroll leaves a stack step above it, not the row flush with the window's top edge
  // (docs/DESIGN.md §6). The table's toggle takes no class of its own, so the row gives it to its cell's button.
  it('gives its toggle the scroll margin of an element a script focus move lands on', async () => {
    await mount(find(await fixtureRows(), 'lump'), plan);
    const toggle = screen.getByRole('button', { expanded: false });
    const row = toggle.closest('tr');
    expect(toggle.parentElement?.parentElement).toBe(row);
    expect(row?.className.split(' ')).toContain('[&>td>button]:scroll-mt-result');
  });

  it('opens a purchase and a sale to their edit buttons', async () => {
    const dca = find(await fixtureRows(), 'dca');
    const onEdit = vi.fn();
    await mount(dca, plan, { onEdit });
    fireEvent.click(screen.getByRole('button', { expanded: false }));
    fireEvent.click(screen.getByRole('button', { name: 'Edit entry' }));
    expect(onEdit).toHaveBeenCalledWith(dca);
    cleanup();
    const sale = find(await fixtureRows(), 'sell');
    await mount(sale, plan, { onEdit });
    fireEvent.click(screen.getByRole('button', { expanded: false }));
    expect(screen.getByRole('button', { name: 'Delete entry' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Edit entry' }));
    expect(onEdit).toHaveBeenLastCalledWith(sale);
  });

  it('a move row offers Edit and Delete', async () => {
    const { entries } = fixtureSnapshot();
    const coin = entries.find((entry) => entry.kind === 'dca')?.coin as CoinId;
    const move = aMove({ coin, date: '2026-10-20' as Entry['date'] });
    const rows = transactions(plan, [...entries, move], holdingContext(plan, await portugal())).rows;
    const row = find(rows, 'move');
    const onDelete = vi.fn();
    const onEdit = vi.fn();
    await mount(row, plan, { onDelete, onEdit });
    const toggle = screen.getByRole('button', { expanded: false });
    expect(toggle.textContent).toContain('Coins moved');
    fireEvent.click(toggle);
    fireEvent.click(screen.getByRole('button', { name: 'Edit entry' }));
    expect(onEdit).toHaveBeenCalledWith(row);
    fireEvent.click(screen.getByRole('button', { name: 'Delete entry' }));
    expect(onDelete).toHaveBeenCalledWith(row);
  });

  it('a move row\'s Amount cell shows its units sent, never "Cost unknown"', async () => {
    const { entries } = fixtureSnapshot();
    const coin = entries.find((entry) => entry.kind === 'dca')?.coin as CoinId;
    const sent = { units: units('0.05'), received: units('0.0498') };
    const move = aMove({ coin, date: '2026-10-20' as Entry['date'], ...sent });
    const rows = transactions(plan, [...entries, move], holdingContext(plan, await portugal())).rows;
    await mount(find(rows, 'move'), plan);
    // The units sent, in the Log's unit format as the row's own line writes them; the cell stays right-aligned.
    expect(document.querySelector('tbody td.text-right')?.textContent).toBe(`0,05000000 ${coin}`);
    expect(document.body.textContent).not.toContain('Cost unknown');
  });

  it("shows a move's route, its units and its fee in the coin, and no fee line when nothing was lost", async () => {
    const { entries } = fixtureSnapshot();
    const coin = entries.find((entry) => entry.kind === 'dca')?.coin as CoinId;
    const shown = async (fields: Partial<Entry>) => {
      const move = aMove({ coin, date: '2026-10-20' as Entry['date'], units: units('0.05'), ...fields });
      const rows = transactions(plan, [...entries, move], holdingContext(plan, await portugal())).rows;
      await mount(find(rows, 'move'), plan);
      fireEvent.click(screen.getByRole('button', { expanded: false }));
      const text = screen.getByRole('list').parentElement?.textContent;
      cleanup();
      return text;
    };
    // The fixture plan writes units in the Portuguese format, at the coin's decimals with a no-break space, as the Log's other rows.
    const paid = await shown({ received: units('0.0498') });
    expect(paid).toContain(`0,05000000 ${coin} moved from Kraken to Ledger`);
    expect(paid).toContain(`Network fee 0,00020000 ${coin}`);
    const free = await shown({ venue: null, received: units('0.05') });
    expect(free).toContain(`0,05000000 ${coin} with no venue moved to Ledger`);
    expect(free).not.toContain('Network fee');
  });

  it('a move row shows the units the Log finds outside its destination', async () => {
    // The fixture holds 0.02215 BTC with no venue and none at Kraken: a move of 0.05 BTC from Kraken finds only those.
    const { entries } = fixtureSnapshot();
    const coin = entries.find((entry) => entry.kind === 'dca')?.coin as CoinId;
    const move = aMove({ coin, date: '2026-10-20' as Entry['date'], units: units('0.05'), received: units('0.0498') });
    const rows = transactions(plan, [...entries, move], holdingContext(plan, await portugal())).rows;
    await mount(find(rows, 'move'), plan);
    fireEvent.click(screen.getByRole('button', { expanded: false }));
    expect(screen.getByText(/^The Log shows/u).textContent?.replace(/\u00a0/g, ' ')).toBe(
      `The Log shows 0,02215 ${coin} outside Ledger on this day, 0,02785 ${coin} fewer than this move sends. Check this move's date and venues against the entries before it.`,
    );
  });

  it('shows one holding line for a transaction of two coins, with the note only where the screen puts it', async () => {
    const lump = find(await fixtureRows(), 'lump');
    await mount(lump, plan, { note: true });
    fireEvent.click(screen.getByRole('button', { expanded: false }));
    expect(screen.getAllByText(/^Tax-free from /)).toHaveLength(1);
    expect(screen.getAllByText('Computed from your dates, not tax advice')).toHaveLength(1);
    cleanup();
    await mount(lump, plan);
    fireEvent.click(screen.getByRole('button', { expanded: false }));
    expect(screen.getAllByText(/^Tax-free from /)).toHaveLength(1);
    expect(screen.queryByText('Computed from your dates, not tax advice')).toBeNull();
  });

  it('the row with the note carries the conditions, the others do not', async () => {
    const lump = find(await fixtureRows(), 'lump');
    await mount(lump, plan, { note: true });
    fireEvent.click(screen.getByRole('button', { expanded: false }));
    expect(screen.getByText(/the counterparty is tax-resident/i)).toBeDefined();
    expect(screen.getByRole('button', { name: 'Show 3 more conditions' })).toBeDefined();
    expect(screen.getByRole('link', { name: 'Sources' })).toBeDefined();
    cleanup();
    await mount(lump, plan);
    fireEvent.click(screen.getByRole('button', { expanded: false }));
    expect(screen.queryByText(/the counterparty is tax-resident/i)).toBeNull();
    expect(screen.queryByRole('button', { name: 'Show 3 more conditions' })).toBeNull();
    expect(screen.queryByRole('link', { name: 'Sources' })).toBeNull();
  });

  it('says nothing about holding on a sale or under a rule of none', async () => {
    await mount(find(await fixtureRows(), 'sell'), plan);
    fireEvent.click(screen.getByRole('button', { expanded: false }));
    expect(screen.queryByText(/ from /)).toBeNull();
    cleanup();
    const noRule: Plan = { ...plan, holdingRule: { kind: 'none' } };
    await mount(find(await fixtureRows(noRule), 'dca'), noRule);
    fireEvent.click(screen.getByRole('button', { expanded: false }));
    expect(screen.queryByText(/ from /)).toBeNull();
  });

  it('renders a skipped month as one line with its note and without the month (its header names it), and no button', async () => {
    const skip = (await fixtureRows()).find((row) => row.type === 'skip') as Row & { type: 'skip' };
    await mount(skip, plan);
    expect(screen.getByRole('cell').textContent).toBe('Skipped');
    expect(screen.queryByRole('button')).toBeNull();
    cleanup();
    await mount({ ...skip, skip: { ...skip.skip, note: 'car repair' } }, plan);
    expect(screen.getByRole('cell').textContent).toBe('Skipped · car repair');
  });
});

// #24 D8: every opened row whose holding is dated (purchases and coins added) shows the standalone Why? right after
// its date, under both effects and under a period of the person's own; sales, moves, skips and rules of none show
// none. It stands beside the date only, never beside a money figure.
describe('LogRow, the holding line\'s "Why?"', () => {
  const coin = plan.coins[0]?.id as CoinId;
  const anyWhy = () => screen.queryByRole('button', { name: /^Why\?/u });
  const open = async (row: Row, rowPlan: Plan) => {
    await mount(row, rowPlan);
    fireEvent.click(screen.getByRole('button', { expanded: false }));
  };
  const expectWhyAfterDate = (line: RegExp, name: string) => {
    const text = screen.getByText(line);
    const link = screen.getByRole('button', { name });
    expect(text.nextElementSibling).toBe(link);
    expect(link.textContent).toBe('Why?');
    expect(link.className).toContain('min-h-target');
    // The date line and the link share their row, and nothing else does: no money figure stands beside it.
    expect(link.parentElement?.textContent).toBe(`${text.textContent}Why?`);
  };

  it('stands right after the date of an opened purchase, and not while the row is closed', async () => {
    await mount(find(await fixtureRows(), 'dca'), plan);
    expect(anyWhy()).toBeNull();
    fireEvent.click(screen.getByRole('button', { expanded: false }));
    expectWhyAfterDate(/^Tax-free from /u, 'Why? The tax-free date');
  });

  it('stands after the date of coins added, with or without a recorded cost', async () => {
    for (const amount of [null, '0' as Entry['amount']]) {
      const held = anEntry({ kind: 'held', slot: null, fee: null, amount, coin, units: units('0.5') });
      await open(find(transactions(plan, [held]).rows, 'held'), plan);
      expectWhyAfterDate(/^Tax-free from /u, 'Why? The tax-free date');
      cleanup();
    }
  });

  it('names the long-term rate date under a lower-rate rule', async () => {
    const us: Plan = {
      ...plan,
      country: 'US' as Plan['country'],
      holdingRule: { kind: 'years', years: 1, effect: 'lower-rate' },
    };
    await open(find(transactions(us, [anEntry({ coin, units: units('0.001') })]).rows, 'dca'), us);
    expectWhyAfterDate(/^Long-term rate from /u, 'Why? The long-term rate date');
  });

  it("names the tax-free date under a period of the person's own in a country of none", async () => {
    const es: Plan = {
      ...plan,
      country: 'ES' as Plan['country'],
      holdingRule: { kind: 'days', days: 730, effect: 'exempt' },
    };
    await open(find(transactions(es, [anEntry({ coin, units: units('0.001') })]).rows, 'dca'), es);
    expectWhyAfterDate(/^Tax-free from /u, 'Why? The tax-free date');
  });

  it('stands beside the date on the row that carries the note and the conditions too', async () => {
    await mount(find(await fixtureRows(), 'lump'), plan, { note: true });
    fireEvent.click(screen.getByRole('button', { expanded: false }));
    expectWhyAfterDate(/^Tax-free from /u, 'Why? The tax-free date');
  });

  it('shows none on a sale, a move, a skipped month or under a rule of none', async () => {
    await open(find(await fixtureRows(), 'sell'), plan);
    expect(anyWhy()).toBeNull();
    cleanup();
    const { entries } = fixtureSnapshot();
    const move = aMove({ coin, date: '2026-10-20' as Entry['date'] });
    await open(find(transactions(plan, [...entries, move], holdingContext(plan, await portugal())).rows, 'move'), plan);
    expect(anyWhy()).toBeNull();
    cleanup();
    await mount((await fixtureRows()).find((row) => row.type === 'skip') as Row, plan);
    expect(anyWhy()).toBeNull();
    cleanup();
    const noRule: Plan = { ...plan, holdingRule: { kind: 'none' } };
    await open(find(await fixtureRows(noRule), 'dca'), noRule);
    expect(anyWhy()).toBeNull();
  });
});
