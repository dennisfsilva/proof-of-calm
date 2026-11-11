'use client';

import {
  actionsNow,
  coinsWithEntries,
  compare,
  compareDates,
  type Entry,
  heldUnits,
  holdingContext,
  isPositive,
  LOG_PAGE,
  type LogRow as LogRowData,
  liveEntries,
  type Money,
  type MonthHeader,
  monthKey,
  primaryAction,
  type SlotsAtDelete,
  type TransactionRow,
  transactionKey,
  transactions,
  UNDO_WINDOW_MS,
} from '@proofofcalm/core';
import { Button } from '@proofofcalm/ui/components/button';
import { Empty, EmptyDescription } from '@proofofcalm/ui/components/empty';
import { Table, TableBody, TableGroupHeader, TableHead, TableHeader, TableRow } from '@proofofcalm/ui/components/table';
import { type ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslations } from 'use-intl';
import { useFormatters, useRules, useServices, useSnapshot, useToday } from '../../../lib/services';
import { logActions } from '../actions';
import { figure } from '../lib/figure';
import { recordedTitle } from '../lib/recorded';
import { deleteRefusalTitle, undoRefusalTitle } from '../lib/row-refusal';
import { EntrySheet, type EntrySheetProps } from './entry-sheet';
import { LOG_COLUMNS, LogRow } from './log-row';
import { MoveSheet } from './move-sheet';

// The Log (docs/DOMAIN.md §3.9): the plan's transactions and skipped months, newest first under month
// headers with the month's bought and sold totals; the last 12 transactions with the skipped months among
// them (a skip does not count), then "Show all N entries" with N the transactions; that choice is the
// device preference `logShowAll` (§2.3), so the Log opens the same way next time. A deletion is a
// soft delete written through the domain store, then the toast "Entry deleted." ("N entries deleted." for a row
// of several) whose Undo restores the entries within UNDO_WINDOW_MS, unless a monthly buy's month was skipped or
// recorded since: then they stay deleted and a toast says why (§6, docs/CONTENT-STYLE.md §3). "Record a purchase"
// opens the entry form on the action Today would offer (the starting amount or a monthly buy still open, else an
// extra buy), with the choice of kinds (docs/CONTENT-STYLE.md §3, Record on the Log); "Log coins you moved", shown
// while a coin is held, opens the move form. A row's Edit opens the entry form on a purchase's or a sale's entries,
// and the move form on a move; a save closes the sheet with "Recorded: …" or
// "Entry saved." (docs/CONTENT-STYLE.md §3), and the sheet gives the focus back to the button that opened it;
// an edit that gave the row a new date (a new key) took that button away, so focus moves to the row's
// toggle under its new key, or to the heading when that row is not shown (docs/ENGINEERING.md §5).

type Target = Pick<EntrySheetProps, 'kind' | 'editing' | 'slot' | 'offerKinds'>;

/** The rows down to the `page`-th transaction, or all of them when no transaction is older. */
function lastTransactions(rows: readonly LogRowData[], page: number): readonly LogRowData[] {
  let seen = 0;
  const last = rows.findIndex((row) => row.type === 'transaction' && ++seen === page);
  const older = last !== -1 && rows.slice(last + 1).some((row) => row.type === 'transaction');
  return older ? rows.slice(0, last + 1) : rows;
}

/**
 * Focuses a row's toggle and brings it into view within the page's scroll padding: the browser's own
 * focus scroll leaves a row that starts under the phone tab bar there (docs/DESIGN.md §6).
 */
function focusInView(element: HTMLElement | null | undefined) {
  element?.focus({ preventScroll: true });
  element?.scrollIntoView({ block: 'nearest' });
}

/** The toggle of the nth transaction, by the mark inside it, since an open detail can hold other controls. */
function rowToggle(list: HTMLElement | null, index: number) {
  return list?.querySelectorAll<HTMLElement>('[data-row]')[index]?.closest('button');
}

export function LogScreen() {
  const t = useTranslations('log');
  const f = useFormatters();
  const { domain, clock, toasts } = useServices();
  const plan = useSnapshot((snapshot) => snapshot.plan);
  const entries = useSnapshot((snapshot) => snapshot.entries);
  const rules = useRules();
  const today = useToday();
  const all = useSnapshot((snapshot) => snapshot.prefs.logShowAll);
  const [open, setOpen] = useState<ReadonlySet<string>>(new Set());
  // The form's props outlive the sheet's close, so the closing sheet keeps its content.
  const [target, setTarget] = useState<Target | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  // The move form's, kept the same way: the move being edited, or null for a new move.
  const [move, setMove] = useState<{ readonly editing: Entry | null } | null>(null);
  const [moveOpen, setMoveOpen] = useState(false);
  const heading = useRef<HTMLHeadingElement>(null);
  const screenRef = useRef<HTMLDivElement>(null);
  // Set while Show all is being written: once the rows are there, focus goes to the first one revealed.
  const revealing = useRef(false);
  // The key of the row an Undo is restoring: once it is back, focus goes to its toggle.
  const restoring = useRef<string | null>(null);
  // The key of the row being deleted and its index among the transaction toggles shown: once it is gone, focus goes
  // to the toggle now at that index, else to the one before, else to the heading (docs/DESIGN.md §6).
  const deleting = useRef<{ key: string; index: number } | null>(null);
  // While the rules of the plan's country load (after a change of country), no row shows a holding date:
  // it would be computed with no country's overrides (ADR-0020 readings, "The first-boot gate").
  const log = useMemo(() => {
    if (plan === null) return null;
    const log = transactions(plan, entries, holdingContext(plan, rules));
    if (rules !== null) return log;
    return { ...log, rows: log.rows.map((row) => (row.type === 'transaction' ? { ...row, holding: null } : row)) };
  }, [plan, entries, rules]);
  // The key of the row being edited, and the key its entries have after the save ('' when nothing was saved).
  const edited = useRef<{ from: string; to: string | null }>({ from: '', to: null });

  // The delete and its Undo read the plan and entries as they are when they run in the store's queue, so an Undo
  // after another write restores only the deleted entries, and none once their month was skipped or recorded since
  // the delete (the toast says which); a write that fails says so and changes nothing.
  const [actions] = useState(() => logActions({ domain, clock }));
  const failed = () => toasts.add({ title: t('row.failed'), timeout: UNDO_WINDOW_MS });
  // A failed write leaves the preference and the button as they were, with the failure toast, and the
  // focus on the button.
  const showAll = () => {
    revealing.current = true;
    // Built in its turn, so a preference still being written (the theme) is kept.
    void domain
      .write((snapshot) => ({ prefs: { ...snapshot.prefs, logShowAll: true } }))
      .catch(() => {
        revealing.current = false;
        failed();
      });
  };
  // The button is gone once all rows show: focus moves to the toggle of the first row it revealed, the
  // transaction after the last LOG_PAGE, so the keyboard continues where the new rows start.
  useEffect(() => {
    if (!all || !revealing.current) return;
    revealing.current = false;
    focusInView(rowToggle(screenRef.current, LOG_PAGE));
  }, [all]);
  useEffect(() => {
    const key = restoring.current;
    if (key === null || log === null) return;
    const marks = screenRef.current?.querySelectorAll<HTMLElement>('[data-row]') ?? [];
    const mark = [...marks].find((candidate) => candidate.dataset.row === key);
    if (mark === undefined) return;
    restoring.current = null;
    focusInView(mark.closest('button'));
  }, [log]);
  // Set before the write and moved here once the commit has removed the row: before it, that index is still the row.
  useEffect(() => {
    const target = deleting.current;
    const marks = [...(screenRef.current?.querySelectorAll<HTMLElement>('[data-row]') ?? [])];
    if (target === null || marks.some((mark) => mark.dataset.row === target.key)) return;
    deleting.current = null;
    const toggle = marks[target.index] ?? marks[target.index - 1];
    focusInView(toggle?.closest('button') ?? heading.current);
  }, [log]);
  const remove = async (row: TransactionRow) => {
    const ids = row.items.map((item) => item.id);
    restoring.current = null;
    const marks = [...(screenRef.current?.querySelectorAll<HTMLElement>('[data-row]') ?? [])];
    deleting.current = { key: row.key, index: marks.findIndex((mark) => mark.dataset.row === row.key) };
    let before: SlotsAtDelete;
    try {
      const deleted = await actions.deleteTransaction(ids);
      if (!deleted.ok) {
        deleting.current = null;
        const title = deleteRefusalTitle(deleted.error, { kind: row.kind, count: ids.length }, f, t);
        toasts.add({ title, timeout: UNDO_WINDOW_MS });
        return;
      }
      before = deleted.value;
    } catch {
      deleting.current = null;
      failed();
      return;
    }
    toasts.add({
      title: t('row.deleted', { count: ids.length, figure: figure(f, ids.length) }),
      timeout: UNDO_WINDOW_MS,
      actionProps: {
        children: t('row.undo'),
        onClick: () => {
          restoring.current = row.key;
          void actions.undoDelete(ids, before).then(
            (restored) => {
              if (restored.ok) return;
              restoring.current = null;
              toasts.add({ title: undoRefusalTitle(restored.error, ids.length, f, t), timeout: UNDO_WINDOW_MS });
            },
            () => {
              restoring.current = null;
              failed();
            },
          );
        },
      },
    });
  };

  const openForm = (next: Target) => {
    setTarget(next);
    setSheetOpen(true);
  };
  const record = () => {
    const action = plan === null ? null : primaryAction(actionsNow(plan, entries, today));
    // Only this path offers the choice of kinds, the open action's first (CONTENT-STYLE §3, Record on the Log).
    if (action === null) openForm({ kind: 'extra', editing: [], offerKinds: true });
    else
      openForm({
        kind: action.kind,
        editing: [],
        offerKinds: true,
        ...(action.slot !== null && { slot: action.slot }),
      });
  };
  const openMove = (editing: Entry | null) => {
    setMove({ editing });
    setMoveOpen(true);
  };
  const edit = (row: TransactionRow) => {
    const { kind } = row;
    edited.current = { from: row.key, to: null };
    // A move's row holds that one move (its key carries the move's id).
    if (kind === 'move') openMove(row.items[0] ?? null);
    else openForm({ kind, editing: row.items });
  };
  // Nothing saved (an entry being edited was deleted meanwhile) closes the sheet; the form has said why.
  const saved = (entries: readonly Entry[], editing: boolean) => {
    const [first] = entries;
    if (editing) edited.current.to = first === undefined ? '' : transactionKey(first);
    if (first === undefined || plan === null) return;
    const title = editing ? t('form.saved') : recordedTitle(entries, plan, f, t);
    toasts.add({ title, timeout: UNDO_WINDOW_MS });
  };
  const done = (entries: readonly Entry[]) => {
    setSheetOpen(false);
    saved(entries, (target?.editing.length ?? 0) > 0);
  };
  const moved = (entries: readonly Entry[]) => {
    setMoveOpen(false);
    saved(entries, (move?.editing ?? null) !== null);
  };
  const live = liveEntries(entries);
  const holds = plan !== null && coinsWithEntries(plan, live).some((coin) => isPositive(heldUnits(live, coin)));

  // "No entries yet" while no entry is live; the skipped months, the person's own record, stay listed under it.
  const empty = plan === null || live.length === 0;
  const past = plan !== null && compareDates(plan.firstBuy, today) < 0;
  const visible = log === null ? [] : all ? log.rows : lastTransactions(log.rows, LOG_PAGE);
  const finalFocus = () => {
    const { from, to } = edited.current;
    edited.current = { from: '', to: null };
    if (to === null || to === from) return true;
    const index = visible.filter((row) => row.type === 'transaction').findIndex((row) => row.key === to);
    return rowToggle(screenRef.current, index) ?? heading.current;
  };
  let content: ReactNode = null;
  if (plan !== null && log !== null && log.rows.length > 0) {
    const total = (amount: Money, key: 'month.bought' | 'month.sold') =>
      compare(amount, '0' as Money) === 0 ? [] : [t(key, { amount: f.money(amount, plan.payCurrency) })];
    const monthLine = (header: MonthHeader) =>
      [f.month(header.month), ...total(header.bought, 'month.bought'), ...total(header.sold, 'month.sold')].join(' · ');
    const count = log.rows.filter((row) => row.type === 'transaction').length;
    // The note goes beside the first holding date on screen: the topmost open row that shows one.
    const noted = visible.find(
      (row) => row.type === 'transaction' && row.holding?.kind === 'dated' && open.has(row.key),
    )?.key;
    const toggle = (key: string) => (next: boolean) =>
      setOpen((keys) => {
        const changed = new Set(keys);
        if (next) changed.add(key);
        else changed.delete(key);
        return changed;
      });
    const body: ReactNode[] = [];
    let month: string | null = null;
    for (const row of visible) {
      const header = log.months.find((candidate) => candidate.month === monthKey(row.date));
      if (header !== undefined && header.month !== month) {
        month = header.month;
        body.push(
          <TableGroupHeader key={`month|${month}`} colSpan={LOG_COLUMNS}>
            {monthLine(header)}
          </TableGroupHeader>,
        );
      }
      body.push(
        <LogRow
          key={row.key}
          row={row}
          plan={plan}
          note={row.key === noted}
          open={open.has(row.key)}
          onOpenChange={toggle(row.key)}
          onDelete={(r) => void remove(r)}
          onEdit={edit}
        />,
      );
    }
    content = (
      <>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead scope="col">{t('table.entry')}</TableHead>
              <TableHead scope="col" numeric>
                {t('table.amount')}
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>{body}</TableBody>
        </Table>
        {!all && count > LOG_PAGE && (
          <Button variant="secondary" className="self-start" onClick={showAll}>
            {t('showAll', { count })}
          </Button>
        )}
      </>
    );
  }

  return (
    <div ref={screenRef} className="mx-auto flex w-full max-w-reading flex-col gap-stack-lg px-gutter py-stack-lg">
      <h1 ref={heading} tabIndex={-1} className="text-28">
        {t('title')}
      </h1>
      {plan !== null && (
        <Button className="self-start" onClick={record}>
          {t('record')}
        </Button>
      )}
      {plan !== null && (
        <Button
          variant="secondary"
          className="self-start"
          onClick={() => openForm({ kind: 'held', editing: [], offerKinds: false })}
        >
          {t('recordHeld')}
        </Button>
      )}
      {holds && (
        <Button variant="secondary" className="self-start" onClick={() => openMove(null)}>
          {t('recordMoved')}
        </Button>
      )}
      {empty && (
        <Empty>
          <EmptyDescription>
            {plan === null
              ? t('empty.noPlan')
              : t(past ? 'empty.firstBuyPast' : 'empty.firstBuy', { date: f.date(plan.firstBuy) })}
          </EmptyDescription>
        </Empty>
      )}
      {content}
      {target !== null && (
        <EntrySheet
          {...target}
          open={sheetOpen}
          onOpenChange={setSheetOpen}
          onDone={done}
          finalFocus={finalFocus}
          onUndone={() => heading.current?.focus()}
        />
      )}
      {move !== null && (
        <MoveSheet {...move} open={moveOpen} onOpenChange={setMoveOpen} onDone={moved} finalFocus={finalFocus} />
      )}
    </div>
  );
}
