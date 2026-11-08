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
import { anEntry, units } from '@proofofcalm/core/testing';
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
