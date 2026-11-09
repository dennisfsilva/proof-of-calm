# ADR-0053: One currency per plan: a change of country asks before it relabels

Status: Accepted · Date: 2026-11-09 · Deciders: the owner, from session 14's two blind designers and its walk along the defaults (#8, 2026-11-08); recorded by session 16 (#10)

## Context

A plan holds one pay currency, and every logged amount is in it, never converted (`docs/DOMAIN.md`
§2.1, ADR-0012). An entry carries no currency of its own.

ADR-0014 lets the country profile set the pay currency (its Decision), and a country change
"re-derives defaults" (its Consequences). The core did that literally: `changeCountry` set both
currencies to the new country's. A person in Portugal who moved to the United Kingdom saw every
€70 they had paid become £70, with no question and no conversion. The plan's monthly amount moved
the same way. §2.1 and §6 "Change country" of `docs/DOMAIN.md` disagreed.

Session 14's walk (Ana PT→GB, Ben's wrong onboarding pick, Carla GB→PT, Dan PT→FR) found two
reasons to change country with entries logged:

- a move: the amounts were paid in the old currency;
- a correction: the country was wrong at onboarding, and the amounts were paid in the new
  country's currency.

Only the person knows which. Most supported countries share EUR; only GB and US change the currency.

## Options considered

1. **Relabel silently** (the code before this ADR). Wrong for every move.
2. **Convert the logged amounts at some rate.** Rejected by both designers. Nothing is converted
   (§2.1, ADR-0012), there is no FX source in v1, and a converted figure could pass for a tax value.
3. **Refuse a change of country while entries exist.** Rejected by both designers. It blocks the
   onboarding correction.
4. **A currency per entry** (designer 2): entry v4 with an optional `currency`, and a plan v4
   `formerCountries` history; about 820 lines in six PRs. Every sum would split by currency or
   hide: Today, Portfolio's P/L and average, the Plan's totals, the Log's totals and the charts. The
   entry form would need a currency select, and both tax-year files a currency column. Moving is
   rare, and only two countries change the currency.
5. **One currency per plan, and the person says which** (designer 1).

## Decision

Option 5.

- A change of country never relabels logged amounts, or the plan's own amounts, without the
  person's word. `docs/DOMAIN.md` §2.1 wins over §6.
- The question is needed when the new country's currency differs from the plan's pay currency and a
  live entry holds an amount or a fee (`currencyQuestion(plan, entries, rules)`, which returns the
  two currencies and the count and first and last dates of those entries, or null).
- The confirmation then asks one required question, with nothing preselected:
  - keep the plan's currency, for a move: the amounts were paid in it, and new ones are logged in it;
  - change to the country's currency, for a correction: the amounts were paid in it, and they show
    as typed; nothing is converted.
  Confirming with no answer is refused, as the rule tick is.
- The answer reaches the core as `changeCountry(plan, rules, now, currency: 'keep' | 'country')`.
  `keep` leaves the pay and display currencies as they are; `country` sets both to the country's.
  With no question needed, the currencies follow the country: no logged amount changes meaning.
- To pay in the new currency from now on after a move, the person keeps the old one, exports a copy,
  and starts a plan in the new currency with the coins already held.
- The write re-runs the question on the stored entries (`changeCountryOf`). A question the screen
  never showed, because another tab logged an amount since, refuses the change as `plan-changed`. An
  answer the stored entries no longer need still stands: `keep` relabels nothing, and the person's
  word is not swapped for another.

The same design adds, around the question (planned: M2), in feat/currency-question:

- a block above the confirm button that offers the current country's tax-year files before the
  rules change, when live entries exist;
- a row saying the plan's monthly amount moves to the new currency ("€300 becomes £300. Check it in
  Plan.");
- a line in Currency & data while the plan's currency and the country's differ, with a button that
  calls the core's `changePayCurrency`, so a wrong "keep" is fixed without changing country again.

## Consequences

- The relabel stops at once (fix/country-keeps-currency). Until the question is shown, Currency &
  data answers `keep` whenever a question is needed, so correcting a wrong onboarding country's
  currency waits for feat/currency-question (planned: M2).
- A plan's currency can differ from its country's. Storage already allowed it: the prototype import
  stores such plans. No schema or row version changes; the rollback read test is
  `packages/app/src/lib/adapters/idb-store.currency.test.ts`.
- The data stays clean, so a currency per entry can still come later with nothing to repair.
- Partly supersedes ADR-0014: the pay currency its profile sets is the default at setup only, and a
  country change re-derives the currency only on the person's word (ADR-0014's Corrections of
  2026-11-09).
- Not decided here: holding rules that apply backwards after a move, the tax years offered after a
  change, and the last fee copied across currencies. Session 16's plan (#10) holds them.
