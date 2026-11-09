# ADR-0014: Country adaptation: profiles, cards, holding rules, tax-year export

Status: Accepted; the currency a country change re-derives superseded in part by ADR-0053 · Date: 2026-10-16 · Deciders: owner (before the session); detailed by the planning session

## Context

The differentiator. Most people do not know the holding rule, the tax year or the reporting duty of
their own country; a planner that knows them turns "hold a year" from folklore into a dated, sourced
statement, and keeps quiet where no such benefit exists. The prototype had a free-text "tax-free in
Portugal" field and a single `holdDays` number, which cannot express Germany's "more than one year".

## Options considered

1. **Free text and a number** (the prototype). Honest only by accident.
2. **Hard-coded rules in code.** Unreviewable by a non-developer, no dates, no sources.
3. **Country profiles as versioned, dated, sourced data** in `packages/content`, validated by a zod
   schema with a confidence field, selected by the user in onboarding (suggested from locale and
   timezone, confirmed with one tap, never taken silently from IP), changeable in Settings.

## Decision

Option 3. The profile sets: pay currency, holding rule (`none`, `days`, or `years`, see
`docs/DOMAIN.md` §2.1 and §3.7), lot rule, date and number formats, suggested language, tax year, and
the jurisdiction card (taxable events, rate or allowance, holding rule, last reviewed, sources).
Templates adopt the country's holding rule. Where there is no holding exemption the hold phase is
still a hold, "tax-free from" disappears, and the card says every sale is a taxable event. The app
never computes a tax bill in v1; it flags holding status per lot and offers a tax-year export aligned
to the country's tax year. When a rule changes, a dated notice is shown once. Milestone 1 ships
Portugal, Germany and the generic profile; milestone 2 the full first set (NL, ES, FR, IT, BE, IE, GB,
US). Schema and review process: ADR-0031 and `docs/JURISDICTIONS.md`.

## Consequences

- `HoldingRule` is a tagged union in the core, with per-country counting rules tested (Portugal 365
  days inclusive; Germany and the US "more than one year", eligible the day after the anniversary).
- The lot rule (FIFO per default) is a profile field consumed by the eligibility and export logic.
- A country change re-derives defaults with an explicit summary and never converts logged amounts.
- "Under review" replaces the card when `nextReviewDue` is more than twelve months past.
- Every claim on a card is general information; the card links to the sources and to Learn's "Taxes
  where you live".

## Disagreement

None. The session adds: the US profile is "general only" and its card must say that state taxes
exist and vary; the UK profile is subject to ADR-0029.

## Corrections recorded on 2026-11-03

The decision stands; this statement of the text above is not true of the repository, and is
corrected here instead of rewritten (`docs/ADR/README.md`).

- **Consequences, fourth bullet: "\"Under review\" replaces the card".** The state is built (#318),
  and the card is not replaced: it keeps its title, shows neither its rule's words nor its Sources,
  and its date line takes the under-review form (`docs/JURISDICTIONS.md` §1; `docs/LEGAL.md` §4 owns
  the words).

## Corrections recorded on 2026-11-09

Partly superseded by ADR-0053 ("One currency per plan: a change of country asks before it
relabels"); the rest of the decision stands.

- **Decision: "The profile sets: pay currency".** It sets the pay currency at setup. A later change
  of country sets it only on the person's answer when a live entry holds an amount or a fee; with
  none, the currencies still follow the country (ADR-0053).
- **Consequences, third bullet: "A country change re-derives defaults".** It re-derives the holding
  rule and the rule version. The pay and display currencies stay as they are unless the person says
  the amounts were paid in the new country's currency; nothing is ever converted (ADR-0053,
  `docs/DOMAIN.md` §2.1 and §6 "Change country").
