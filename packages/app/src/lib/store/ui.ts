// The UI store (ADR-0020): ephemeral shell state that does not survive a reload. Today's date from the
// Clock port (ADR-0042), the loaded rules of the plan's country and the last price failure as a value.
// Toasts are not here: packages/ui's manager holds the one toast and its timer (ADR-0020 readings).
import type { CalendarDate, CountryCode, CountryRules } from '@proofofcalm/core';
import { createStore, type StoreApi } from 'zustand/vanilla';
import type { PricesFailure } from '../ports';

/** The rules loaded for `country`, or null for one the content has no profile for. */
export type LoadedRules = { readonly country: CountryCode; readonly rules: CountryRules | null };

export type UiState = {
  /** The calendar date in the user's zone, refreshed by the services' tick. */
  readonly today: CalendarDate;
  /**
   * Null while nothing is loaded (no plan, or the first rules are still on their way). After a change of
   * country it holds the previous country's rules until the new ones load; `useRules` hides them.
   */
  readonly rules: LoadedRules | null;
  /** Set once, at the first ready snapshot with its country's rules (or no plan); the shell's gate. */
  readonly booted: boolean;
  /** Why the last price refresh failed; null after one that succeeded. */
  readonly pricesFailure: PricesFailure | null;
  /** Expanded rows of tables, by row key. */
  readonly open: ReadonlySet<string>;
  setToday(today: CalendarDate): void;
  setRules(rules: LoadedRules | null): void;
  setBooted(): void;
  setPricesFailure(failure: PricesFailure | null): void;
  toggle(key: string): void;
};

export function createUiStore(initial: { readonly today: CalendarDate }): StoreApi<UiState> {
  return createStore<UiState>()((set) => ({
    today: initial.today,
    rules: null,
    booted: false,
    pricesFailure: null,
    open: new Set(),
    setToday: (today) => set({ today }),
    setRules: (rules) => set({ rules }),
    setBooted: () => set({ booted: true }),
    setPricesFailure: (pricesFailure) => set({ pricesFailure }),
    toggle: (key) =>
      set((state) => {
        const open = new Set(state.open);
        if (open.has(key)) open.delete(key);
        else open.add(key);
        return { open };
      }),
  }));
}
