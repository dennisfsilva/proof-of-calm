// The hooks over the services: selectors on the two stores (ADR-0020) and the ports as values.
// Navigation is not here: lib/navigation's `useRouter` is the one router hook (ADR-0045 §9).
import type { CalendarDate, CountryRules } from '@proofofcalm/core';
import type { ToastManager } from '@proofofcalm/ui/components/toast';
import { useMemo } from 'react';
import { useStore } from 'zustand';
import type { Drafts } from '../adapters/drafts';
import { createFormatters, createNumberInput, type Formatters, type NumberInput } from '../format';
import { localesFor } from '../i18n/locale';
import type { Clock, Platform, PricesFailure, PricesState, Snapshot } from '../ports';
import type { DomainState } from '../store/domain';
import type { UiState } from '../store/ui';
import { useServices } from './provider';

export { useServices };

export function useSnapshot<T>(select: (snapshot: Snapshot) => T): T {
  return useStore(useServices().domain.store, (state) => select(state.snapshot));
}

export function useDomainStatus(): DomainState['status'] {
  return useStore(useServices().domain.store, (state) => state.status);
}

export function useUi<T>(select: (state: UiState) => T): T {
  return useStore(useServices().ui, select);
}

/**
 * The shell's state: `failed` while the domain is; `ready` once the services booted (the first ready
 * snapshot with its country's rules, or no plan), and from then on, so a later change of country never
 * unmounts the screens; before that, `loading` while the domain is or the plan's rules are not loaded.
 */
export function useBoot(): 'loading' | 'ready' | 'failed' {
  const status = useDomainStatus();
  const country = useSnapshot((snapshot) => snapshot.plan?.country ?? null);
  const rules = useUi((state) => state.rules);
  const booted = useUi((state) => state.booted);
  if (status === 'failed') return 'failed';
  if (booted) return 'ready';
  if (status !== 'ready') return status;
  if (country !== null && rules?.country !== country) return 'loading';
  return 'ready';
}

export function useToday(): CalendarDate {
  return useUi((state) => state.today);
}

/** The rules of the plan's country; null while another country's are still loaded (never mixed). */
export function useRules(): CountryRules | null {
  const country = useSnapshot((snapshot) => snapshot.plan?.country ?? null);
  return useUi((state) => (state.rules !== null && state.rules.country === country ? state.rules.rules : null));
}

/**
 * The formatters of the plan's country in the UI language (ADR-0023), remade only when the loaded rules
 * change: after a change of country they keep the previous record's locale until the new rules load.
 */
export function useFormatters(): Formatters {
  const { language } = useServices();
  const rules = useUi((state) => state.rules?.rules ?? null);
  return useMemo(() => {
    const locales = localesFor(language, rules);
    return createFormatters(locales.numbers, locales.ui);
  }, [language, rules]);
}

/**
 * The parser of what is typed in a numeric field (ADR-0034), in the plan's country's number locale and
 * the UI language: none while that country's rules load (`useRules`' condition), so a form never reads
 * a number in one locale and then in another; with no plan, the UI language's locale. A country whose
 * rules did not load reads in the UI language's locale, as the formatters do. Remade only when the
 * locale changes; a form that must keep it while open freezes the first one it gets (ADR-0020 Readings).
 */
export function useNumberInput(): NumberInput | null {
  const { language } = useServices();
  const country = useSnapshot((snapshot) => snapshot.plan?.country ?? null);
  const loaded = useUi((state) => state.rules);
  const loading = country !== null && loaded?.country !== country;
  const locale = loading ? null : localesFor(language, country === null ? null : (loaded?.rules ?? null)).numbers;
  return useMemo(() => (locale === null ? null : createNumberInput(locale)), [locale]);
}

export function useClock(): Clock {
  return useServices().clock;
}

export function usePlatform(): Platform {
  return useServices().platform;
}

export function useDrafts(): Drafts {
  return useServices().drafts;
}

export function useToasts(): ToastManager {
  return useServices().toasts;
}

export function usePrices(): {
  readonly state: PricesState | null;
  readonly failure: PricesFailure | null;
  refresh(): Promise<void>;
} {
  const { prices } = useServices();
  const state = useSnapshot((snapshot) => snapshot.prices);
  const failure = useUi((ui) => ui.pricesFailure);
  return { state, failure, refresh: prices.refresh };
}
