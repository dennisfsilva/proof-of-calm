# ADR-0034: Forms, validation and numeric input

Status: Accepted · Date: 2026-10-16 · Deciders: planning session (research: `docs/research/stack-frontend.md` §9)

## Context

The forms are small (plan editor, log entry with per-coin amount, units and price, settings, onboarding steps) and dominated by numeric inputs typed on phones in locales that use a comma as the decimal separator. `type="number"` accepts separators inconsistently across browsers and scrolls to increment; `Number()` on a typed string silently misreads `1.000,50`. zod 4 ships a `zod/mini` build measured at 5 kB gzip against 26 kB for the classic import.

## Options considered

react-hook-form 7.90 (12.8 kB gzip, uncontrolled-first, needs `Controller` for custom inputs), TanStack Form 1.33 (17.3 kB, controlled, Standard Schema natively), or no form library with React 19 primitives.

## Decision

- **No form library in M1.** Controlled inputs, one `zod/mini` schema per form in `packages/core` (`parsePlanInput(raw): Result<Plan, FormIssues>`), React 19 `useActionState` for submit, pending and error states, field errors mapped from `safeParse().error.issues`. **TanStack Form 1.33.5** is the escape hatch if a form grows past about eight fields or needs arrays with per-field validation (the coin editor is the candidate); it consumes the same schemas through Standard Schema.
- **`zod/mini` in every client bundle**; classic `zod` only in route handlers and Node scripts. Types inferred from schemas everywhere.
- **Numeric input**: `<input type="text" inputMode="decimal" autoComplete="off">`; parse with the formatting locale (ADR-0023): strip the group symbol, accept the locale's decimal symbol and also the other one when it appears exactly once and no group symbol is present (people switch keyboards), reject anything else, build the decimal from the normalised string (ADR-0017); re-render the normalised value in locale format on blur; never `Number()` or `parseFloat`. Minus is not accepted in amount fields (sales are a kind, not a sign).
- **Dates**: `<input type="date">` with `min` and `max`; its value is `YYYY-MM-DD` whatever the display locale; the string is used as is (ADR-0018). The buy day is a select of 1 to 28.
- **Three-way fill** in the entry form (amount, units, price) ported from the prototype: editing any field recomputes the third with the explicit rounding modes; the implied price is never stored.
- **Drafts**: every form keeps a draft in `sessionStorage` keyed by form and entity; abandoning and returning restores it; saving clears it.
- **Keyboard**: on phone projects the Playwright fixture shrinks the viewport height while a field is focused and asserts the focused field and the submit button remain visible (`docs/ENGINEERING.md` §3).

## Consequences

- Validation messages are core error codes mapped to copy in the shell, so the same rule produces the same message in every form.
- Component tests cover the parser with locale fixtures (`1.234,56`, `1 234,56`, `1,234.56`, `1234.56`, `1234,56`, `12,5`, `12.5`, rejects `1,234,56`).
- Fee splitting and planned parts never happen in the form; they are core functions.

## Readings recorded by the build session

The decision stands; these are the choices its text left open, made while implementing it on
2026-10-17.

- **Where the parser lives.** `packages/app/src/lib/format/number-input.ts` (`createNumberInput`),
  beside the formatting layer whose inverse it is: both read the same formatting locale, and the
  exception of `docs/ENGINEERING.md` §1.2 covers one folder.
- **The symbols.** From `formatToParts(1234567.5)` rather than ADR-0023's `1234.5`: pt-PT and es-ES
  group only from five digits, so a four-digit number shows them no group symbol. Digits are Latin.
- **Spaces.** Where the locale groups with a no-break space (pt-PT, de-AT) or a narrow one (fr-FR), a
  typed space, no-break space or narrow no-break space all count as the group symbol; elsewhere a space
  is refused (`1 234.56` in en-GB).
- **Groups are checked, and the locale wins a tie.** A grouped integer is one to three digits, not
  starting with zero, then groups of three. Where the group symbol is also the other decimal symbol
  (the comma in en-GB, the point in de-DE), a single one that cannot be a group is the decimal point
  (`12.5` and `0.005` in de-DE, `1234,56` in en-GB), and one that can stays a group (`1.234` is 1234 in
  de-DE). A comma and a point mixed against the locale (`1.234,56` in en-GB or pt-PT) are refused.
- **Edges.** `,5` is 0.5 and `12,` is 12; a separator alone, a second decimal separator, letters,
  currency symbols and `+` are refused; leading zeros are dropped; at most 100 fraction digits, Intl's
  limit, so that every accepted value can be written back unrounded.
- **Errors as codes.** `number-empty`, `number-negative` (a leading `-` or `−`, so the copy can name
  the fix) and `number-invalid` with an `example` (1234.56 in the locale's format), worded under
  `errors.input` by the error surface.
- **On blur.** `format(value, minimumFractionDigits)` writes every decimal the value has, padded to a
  minimum (two for money), with the locale's grouping; reading back what it writes gives the same
  value in eleven formatting locales (a property test, as ADR-0017 asks).
- **Drafts.** `lib/adapters/drafts.ts` keeps JSON under `proof-of-calm:draft:<form>:<entity>` (`new`
  before the entity exists) and reads it back through the form's schema; a draft that no longer fits
  or is not JSON is removed. Storage that is missing or throws means no draft, and a failed write
  removes the older draft so it cannot come back later. "Delete everything" removes every draft in
  the tab (`clearAll`, every key under `proof-of-calm:draft:`), called by the domain store's
  `afterWipe` once the stored data is gone; the composition root passes it (wired by the app shell,
  issue #33). Other tabs keep their own `sessionStorage` until they close.
- **The plan's amounts and dates** (2026-10-21). `schedule` in
  `packages/app/src/features/plan/lib/schedule.ts` reads the monthly and starting amounts with the
  host's `NumberInput`, as `coinSplit` reads the shares: an empty amount reads as 0, so an empty
  starting amount is none and two empty amounts are `no-amount`, on the monthly amount. A date left
  empty is `date-required`. The amounts that cannot be read and the empty dates come first; the
  plan's checks wait for them, then only the core's issues on the five fields are kept. The last
  buy's date input takes the first buy as `min` and, as `max`, the last date the core's
  `plan-too-long` check accepts (`lastBuyMax`): the day before the 241st buy, or 20 years after the
  first buy when that comes first. A refused `plan-too-long` comes back with the half that refused
  it (`limit`): `buys` when the plan makes more than 240, else `years` (a plan with no monthly amount
  has no buys), and each half has its own message; the buy day is the
  design system's select. The plan editors keep each amount and share as typed: neither writes the
  value back on blur, since the host, not the editor, holds the `NumberInput`.
- **The number locale while the rules load** (2026-10-21). `useNumberInput` in
  `packages/app/src/lib/services/hooks.ts` gives no `NumberInput` while the plan's country's rules
  are loading, so a form never reads a number in the UI language's locale and then in the
  country's. The entry form mounts its fields once it has one and keeps it while open (ADR-0020
  Readings), through a later change of the plan's country; a country whose rules did not load reads numbers in the UI language's locale, as the
  formatters do.
- **Drafts in every tab on "Delete everything"** (2026-10-21; replaces "Other tabs keep their own
  `sessionStorage` until they close" under Drafts). The wiping tab tells the others by name (a
  `wiped` message on the cross-tab channel, then the usual `changed`), and each runs its own
  `afterWipe`, so no open tab keeps a draft of a plan that is gone. The Undo puts back the stored
  rows only; a draft cleared by the wipe stays gone (ADR-0019 Readings). Proven in
  `packages/app/src/lib/store/tabs.test.ts`.
- **The third field includes the amount** (2026-11-05). Units and a price beside no amount fill it,
  half-even at the currency's minor unit, and never as 0: an amount that rounds to 0 stays empty,
  so a 0.00 nobody typed never reaches a save. Units typed beside the live price therefore fill the
  amount, and the entry form's hint "Type two of the three" holds. An amount typed beside typed
  units derives the price, so a price the form filled, or one typed earlier, yields to the two
  figures an entry stores; a price edit still recomputes the units. The filled amount is derived
  like the others (`packages/app/src/features/log/lib/row.ts`), and `toDraft` passes it only while
  the units and the price both back it. The rule is in `docs/DOMAIN.md` §6, "Fill a form row".
- **A dated entry** (2026-11-06). The price the entry form fills is the live price read as it
  opened, so it belongs to the opening day: a new purchase dated earlier empties each filled price
  and the field derived from it (`packages/app/src/features/log/lib/dated.ts`), and one line under
  the rows asks for the amount paid and the units received; the opening day or a later one fills
  the opened price again. Typed and derived prices, sales and edits keep theirs, and a restored
  draft follows the same rule (ADR-0020 Readings). The rule is in `docs/DOMAIN.md` §6.

## Disagreement

None.
