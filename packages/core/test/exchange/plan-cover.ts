import type { ExchangeFile } from '../../src/import/exchange/kraken';
import type { ExchangeImportPlan } from '../../src/import/exchange/plan';
import { leftOutFrom } from '../../src/import/exchange/plan-guards';
import type { Entry } from '../../src/schema/entry';
import type { EntityId } from '../../src/schema/ids';
import { testId } from './plan-fixture';

/** The worlds this test file's properties excepted as `coverCut` (each file runs in its own module scope). */
export const excepted = { worlds: 0 };

const COVERS: ReadonlySet<Entry['kind']> = new Set(['dca', 'extra', 'lump', 'held']);

/**
 * docs/DOMAIN.md §3.13 step 5's stated exception for a shorter export (a prefix of an export's rows, a window or a date
 * range): the sales `shorter` stores that one import of the whole `file` leaves out (`whole.uncovered`), each because
 * its cover counts another import's live entry of its coin in `entries`, the Log before both, dated on or after the
 * whole file's F (its coin's earliest purchase or receipt steps 3 and 4 leave out) and on or before the sale, which
 * the shorter export counts because it leaves out none of that coin's purchases before the entry. Seed 13's first
 * world is pinned in plan-sales.test.ts ("a prefix that holds none of the left-out purchases").
 */
export function coverCut(
  entries: readonly Entry[],
  file: ExchangeFile,
  shorter: ExchangeImportPlan,
  whole: ExchangeImportPlan,
  idOf: (key: string) => EntityId = testId,
): ReadonlySet<EntityId> {
  const ids = new Set(file.movements.map((movement) => idOf(movement.key)));
  const left = new Set(whole.uncovered.map(({ id }) => id));
  const fromWhole = leftOutFrom(whole.startingAmount, whole.held);
  const fromShorter = leftOutFrom(shorter.startingAmount, shorter.held);
  const others = entries.filter(
    (entry) =>
      entry.deletedAt === null && entry.source === 'import-csv' && !ids.has(entry.id) && COVERS.has(entry.kind),
  );
  const sales = shorter.entries.filter((sale) => {
    const from = fromWhole.get(sale.coin);
    const counted = fromShorter.get(sale.coin);
    return (
      sale.kind === 'sell' &&
      left.has(sale.id) &&
      from !== undefined &&
      others.some(
        (entry) =>
          entry.coin === sale.coin &&
          entry.date >= from &&
          entry.date <= sale.date &&
          (counted === undefined || entry.date < counted),
      )
    );
  });
  return new Set(sales.map((sale) => sale.id));
}

/** `log` without the excepted sales `out`, counting the world in `excepted` when it held one. */
export function withoutExcepted<T extends { readonly id: EntityId }>(log: readonly T[], out: ReadonlySet<EntityId>) {
  const kept = log.filter((entry) => !out.has(entry.id));
  if (kept.length < log.length) excepted.worlds += 1;
  return kept;
}
