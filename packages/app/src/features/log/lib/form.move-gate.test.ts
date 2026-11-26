import { type CoinId, type Entry, movesLeftShort, saveTransaction, type TransactionKind } from '@proofofcalm/core';
import { aMove, anEntry, aPlan, BTC, date, ETH, id, instant, units } from '@proofofcalm/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createNumberInput } from '../../../lib/format';
import { type FormState, initialState, moveShortLines, toDraft } from './form';

// The move line before Save at the Log's cap (docs/ENGINEERING.md §4): a move's shortfall reads only the entries on or
// before its date, so a save that touches only later entries of its coins runs neither the save nor movesLeftShort.
vi.mock('@proofofcalm/core', async (original) => {
  const core = await original<typeof import('@proofofcalm/core')>();
  return { ...core, saveTransaction: vi.fn(core.saveTransaction), movesLeftShort: vi.fn(core.movesLeftShort) };
});

const en = createNumberInput('en-GB');
const plan = aPlan();
const now = instant('2026-10-20T10:00:00.000Z');
const holding = { overrides: [], lotScope: 'per-venue', lotRule: 'fifo' } as const;
const at = (day: string) => instant(`${day}T09:00:00+00:00`);
const bought = (day: string, coin: CoinId = BTC.id) =>
  anEntry({
    kind: 'extra',
    slot: null,
    coin,
    date: date(day),
    units: units('0.01'),
    venue: 'Kraken',
    createdAt: at(day),
  });
const sold = (day: string, coin: CoinId = BTC.id) =>
  anEntry({
    kind: 'sell',
    slot: null,
    coin,
    date: date(day),
    units: units('0.001'),
    venue: 'Kraken',
    createdAt: at(day),
  });
const moved = (day: string, coin: CoinId = BTC.id) =>
  aMove({ coin, date: date(day), units: units('0.002'), received: units('0.0019'), createdAt: at(day) });

const purchase = bought('2026-01-05');
const sale = sold('2026-03-10');
const ethPurchase = bought('2026-01-05', ETH.id);
// The purchase of 4 January keeps the sale covered when an edit moves the one of 5 January past it.
const stored = [bought('2026-01-04'), purchase, sale, ethPurchase, moved('2026-02-01')];

/** The lines for a new transaction (`editing` empty) or an edit, dated `day`, its first row's coin `coin`. */
function lines(entries: readonly Entry[], kind: TransactionKind, day: string, editing: Entry[] = [], coin?: CoinId) {
  const ctx = { plan, entries, today: date('2026-10-20'), prices: null, numberInput: en };
  const initial = editing.length > 0 ? initialState(kind, editing, undefined, ctx) : null;
  const fresh = { source: null, coin: BTC.id, decimals: 8, amount: '', units: '', price: '', derived: null };
  const [first = fresh, ...rest] = initial?.rows ?? [];
  const row = { ...first, coin: coin ?? first.coin, amount: '10', units: '0.001', derived: null };
  const current: FormState = { kind, date: day, slot: null, fee: '', venue: 'Kraken', note: '', rows: [row, ...rest] };
  const draft = toDraft(current, en);
  if (!draft.ok) throw new Error('unreadable draft');
  const save = { plan, editing, ids: [id()], now, source: 'manual', initial: initial ?? current, current } as const;
  return moveShortLines(draft.value, { entries, save, holding });
}

const calls = () => [vi.mocked(saveTransaction).mock.calls.length, vi.mocked(movesLeftShort).mock.calls.length];

describe('moveShortLines at the cap', () => {
  beforeEach(() => {
    vi.mocked(saveTransaction).mockClear();
    vi.mocked(movesLeftShort).mockClear();
  });

  it('runs neither the save nor movesLeftShort when every live move of the coins is dated before the save', () => {
    expect(lines(stored, 'extra', '2026-03-15')).toEqual([]);
    // An edit dated after the move whose entry is stored after it too.
    expect(lines(stored, 'sell', '2026-03-20', [sale])).toEqual([]);
    // A move of another coin, or a deleted one, dated after the save leaves nothing to check.
    const others = [...stored, moved('2026-04-01', ETH.id), { ...moved('2026-04-01'), deletedAt: now }];
    expect(lines(others, 'extra', '2026-03-15')).toEqual([]);
    expect(calls()).toEqual([0, 0]);
  });

  it('runs both for a save dated on the day of a live move of its coin', () => {
    lines(stored, 'extra', '2026-02-01');
    expect(calls()).toEqual([1, 1]);
  });

  it('runs both for an edit moved to before a move, or whose entry is stored before one', () => {
    lines(stored, 'sell', '2026-01-20', [sale]);
    expect(calls()).toEqual([1, 1]);
    lines(stored, 'extra', '2026-03-15', [purchase]);
    expect(calls()).toEqual([2, 2]);
  });

  it('runs both for an edit into a coin with a later live move, and for one out of it', () => {
    // A second ETH purchase keeps the ETH move's fee covered once the edit takes the first to BTC.
    const entries = [...stored, bought('2026-01-04', ETH.id), moved('2026-03-12', ETH.id)];
    // A BTC sale stored on 10 March becomes an ETH one dated 15 March: the ETH move of 12 March reads it.
    lines(entries, 'sell', '2026-03-15', [sale], ETH.id);
    expect(calls()).toEqual([1, 1]);
    // An ETH purchase stored on 5 January becomes a BTC one dated 15 March: the ETH move loses it.
    lines(entries, 'extra', '2026-03-15', [ethPurchase], BTC.id);
    expect(calls()).toEqual([2, 2]);
  });
});
