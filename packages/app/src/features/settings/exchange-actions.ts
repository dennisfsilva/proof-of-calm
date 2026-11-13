// The exchange import's write (docs/DOMAIN.md §3.13): in one write of the domain store's queue, on the entries as
// stored, the plan is computed again (D7); a plan that differs from the one the preview showed, because another tab
// changed the Log since, is refused with the new plan and nothing is written. The core decides what is imported.
import {
  applyExchangeImport,
  type ExchangeFile,
  type ExchangeImportPlan,
  type ExchangeImportRefusal,
  type ImportChoices,
  planExchangeImport,
  sameImport,
} from '@proofofcalm/core';
import type { Services } from '../../lib/services';
import { holdsNewerRows } from './actions';
import { exchangeContext } from './model/import';

/** What an exchange import wrote, or why it wrote nothing. */
export type ExchangeImportOutcome =
  | {
      readonly kind: 'imported';
      readonly added: number;
      readonly replaced: number;
      readonly imported: number;
      readonly deleted: number;
    }
  | {
      readonly kind: 'refused';
      readonly refusal:
        | ExchangeImportRefusal
        | { readonly code: 'newer-rows' }
        | { readonly code: 'no-plan' }
        | { readonly code: 'changed'; readonly plan: ExchangeImportPlan };
    };

export function exchangeImportActions(services: Services) {
  const { domain, clock, ui } = services;
  return {
    /** Writes the import of `file` the preview showed as `shown`, refused when the Log gives another plan now. */
    async importFile(file: ExchangeFile, shown: ExchangeImportPlan, choices: ImportChoices) {
      let outcome: ExchangeImportOutcome | null = null;
      await domain.write((snapshot) => {
        const refuse = (refusal: Extract<ExchangeImportOutcome, { kind: 'refused' }>['refusal']) => {
          outcome = { kind: 'refused', refusal };
          return {};
        };
        if (holdsNewerRows(snapshot)) return refuse({ code: 'newer-rows' });
        const { plan, entries } = snapshot;
        if (plan === null) return refuse({ code: 'no-plan' });
        const now = clock.now();
        const context = exchangeContext(ui.getState().today, now, clock.timeZone);
        const recomputed = planExchangeImport(file, { plan, entries }, choices, context);
        if (!sameImport(shown, recomputed)) return refuse({ code: 'changed', plan: recomputed });
        const write = applyExchangeImport(entries, recomputed, now);
        if (write.refused !== null) return refuse(write.refused);
        const { added, replaced } = write;
        outcome = { kind: 'imported', added, replaced, imported: recomputed.imported, deleted: recomputed.deleted };
        // Adding nothing writes nothing; otherwise only the tombstones and the added rows are written.
        if (added === 0) return {};
        return { entries: write.entries.filter((entry, index) => entry !== entries[index]) };
      });
      if (outcome === null) throw new Error('the exchange import did not run');
      return outcome as ExchangeImportOutcome;
    },
  };
}
