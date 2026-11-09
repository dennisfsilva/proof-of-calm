'use client';

import {
  type Entry,
  isEstimate,
  isPositive,
  type Plan,
  type LogRow as Row,
  type TransactionRow,
  unitsOut,
} from '@proofofcalm/core';
import { Button } from '@proofofcalm/ui/components/button';
import { CoinChip } from '@proofofcalm/ui/components/coin-chip';
import { TableCell, TableExpandableRow, TableRow } from '@proofofcalm/ui/components/table';
import { coinColour } from '@proofofcalm/ui/lib/series';
import { useTranslations } from 'use-intl';
import { useFormatters } from '../../../lib/services';
import { HoldingConditions } from '../../learn';

// One row of the Log (docs/DOMAIN.md §3.9, docs/DESIGN.md §7): a transaction shows its date, kind,
// coins and total, and opens to its items (a one-tap item's units marked as estimated until an edit changes
// them, ADR-0003), its fee, its one holding line ("Tax-free from …", nothing
// under a rule of none), the edit button and the delete button; a skipped month is one line where the buy would have
// been, under its month header (docs/CONTENT-STYLE.md §3). A move opens to its units and route, its network fee in the
// coin when units were lost on the way, and the delete button only. The screen holds which rows are open and
// decides which one carries the "Computed from your dates" line and the country's conditions, so they
// appear once, beside the first date shown (docs/LEGAL.md §4).

export const LOG_COLUMNS = 2;

export type LogRowProps = {
  readonly row: Row;
  readonly plan: Plan;
  /** This row carries the screen's one "Computed from your dates, not tax advice" line and the conditions. */
  readonly note: boolean;
  /** Whether the detail is open, when the screen holds it; the row holds it otherwise. */
  readonly open?: boolean;
  readonly onOpenChange?: (open: boolean) => void;
  readonly onDelete: (row: TransactionRow) => void;
  /** Opens the entry form on the row, a purchase or a sale. */
  readonly onEdit: (row: TransactionRow) => void;
};

export function LogRow({ row, plan, note, open, onOpenChange, onDelete, onEdit }: LogRowProps) {
  const t = useTranslations('log');
  const f = useFormatters();
  if (row.type === 'skip') {
    // The month header above the row names the month, so the line does not repeat it.
    const text = row.skip.note.trim();
    return (
      <TableRow>
        <TableCell colSpan={LOG_COLUMNS} className="text-ink-2">
          {text === '' ? t('skip.line') : t('skip.lineWithNote', { note: text })}
        </TableCell>
      </TableRow>
    );
  }

  const currency = plan.payCurrency;
  const coins = [...new Set(row.items.map((item) => item.coin))];
  const coin = (id: Entry['coin']) => plan.coins.findIndex((candidate) => candidate.id === id);
  const decimals = (id: Entry['coin']) => plan.coins[coin(id)]?.decimals ?? 8;
  const holding = row.holding?.kind === 'dated' ? row.holding : null;
  const units = (item: Entry, value: Entry['units'] = item.units) => f.units(value, item.coin, decimals(item.coin));
  /** A move's line: its units and route, read-only; the source with no venue named as the Log names it. */
  const move = (item: Entry) =>
    t('row.move', {
      at: item.venue === null ? 'unnamed' : 'venue',
      units: units(item),
      from: item.venue ?? '',
      to: item.to ?? '',
    });
  /** The units a move lost on the way, its network fee in the coin; none when all arrived. */
  const coinFees = row.items.filter((item) => row.kind === 'move' && isPositive(unitsOut(item)));
  const summary = (
    <span className="flex flex-col gap-1 py-2">
      {/* The date never breaks across lines; the Log finds a restored row by its key. */}
      <span data-row={row.key} className="whitespace-nowrap">
        {f.date(row.date)}
      </span>
      <span className="flex flex-wrap items-center gap-2 text-13 text-ink-2">
        {t(`kind.${row.kind}`)}
        {coins.map((id) => (
          <CoinChip key={id} coin={id} colour={coinColour(id, Math.max(coin(id), 0))} />
        ))}
      </span>
    </span>
  );
  const detail = (
    <div className="flex flex-col items-start gap-2">
      <ul className="flex flex-col gap-1">
        {row.items.map((item) => (
          <li key={item.id} className="nums">
            {row.kind === 'move'
              ? move(item)
              : item.amount === null
                ? units(item)
                : t(isEstimate(item) ? 'row.estimate' : 'row.item', {
                    units: units(item),
                    amount: f.money(item.amount, currency),
                  })}
          </li>
        ))}
      </ul>
      {coinFees.map((item) => (
        <p key={item.id} className="nums">
          {t('row.moveFee', { units: units(item, unitsOut(item)) })}
        </p>
      ))}
      {row.items.some((item) => item.fee !== null) && <p>{t('row.fee', { amount: f.money(row.fees, currency) })}</p>}
      {holding !== null && (
        <>
          <p>
            {t(holding.effect === 'exempt' ? 'holding.exempt' : 'holding.lowerRate', { date: f.date(holding.from) })}
            {note && <span className="block text-13 text-ink-2">{t('holding.note')}</span>}
          </p>
          {note && <HoldingConditions />}
        </>
      )}
      <div className="flex flex-wrap gap-target-gap">
        {/* A move's row offers Delete only: the Log's form records purchases and sales. */}
        {row.kind !== 'move' && (
          <Button variant="secondary" onClick={() => onEdit(row)}>
            {t('row.edit')}
          </Button>
        )}
        <Button variant="destructive" onClick={() => onDelete(row)}>
          {t('row.delete')}
        </Button>
      </div>
    </div>
  );
  // The toggle is where the Log's script focus moves land (the row after Show all, the row an Undo restores): it
  // keeps a stack step above it after the least scroll (docs/DESIGN.md §6). The table's toggle takes no class itself.
  return (
    <TableExpandableRow
      summary={summary}
      detail={detail}
      colSpan={LOG_COLUMNS}
      className="[&>td>button]:scroll-mt-result"
      {...(open !== undefined && { open })}
      {...(onOpenChange !== undefined && { onOpenChange })}
    >
      {/* Coins added with no recorded cost say so; at no cost they show 0 (DOMAIN §2.2). */}
      <TableCell numeric>{row.total === null ? t('row.noCost') : f.money(row.total, currency)}</TableCell>
    </TableExpandableRow>
  );
}
