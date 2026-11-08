import { useFormatters, useProfile, useRules, useToday } from '../../../lib/services';
import { type HoldingCountry, holdingCountryOf } from '../../plan';

// The plan's country's rule as its card shows it, for Hold & sell and the Plan tab (docs/JURISDICTIONS.md §1):
// null while the rules load, then the rule with the source's URL (or the generic profile's own text) from the
// profile `useProfile` reads: at once when a load has read it, else once it answers (the shell boots on the
// rules file, not the profile; ADR-0049). Until then the rule shows without its source.

export function useHoldingCountry(): HoldingCountry | null {
  const rules = useRules();
  const f = useFormatters();
  const today = useToday();
  const profile = useProfile(rules?.code);
  if (rules === null) return null;
  return holdingCountryOf(rules, f.date(rules.status.lastReviewed), profile, today);
}
