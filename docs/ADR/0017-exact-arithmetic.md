# ADR-0017: Exact arithmetic with a decimal type; strings in storage

Status: Accepted · Date: 2026-10-16 · Deciders: planning session (research: `docs/research/stack-frontend.md` §10)

## Context

The prototype computes money and coin units with JavaScript floats (`eur / price`, `Math.round(x * 100) / 100`), splits amounts per coin with per-part rounding that can drift by a cent, and formats with `toFixed`. Proof of Calm stores amounts in the pay currency to two decimals, coin units to up to ten decimals, and must split a monthly amount and a fee across coins so that the parts sum exactly to the whole.

## Options considered

| Library | Size (gzip) | Notes |
|---|---|---|
| **big.js 7.0.1** | 2.9 kB | immutable; rounding modes down, half-up, half-even, up; `DP` applies to division only; strings in and out |
| decimal.js 10.6.0 | 12.7 kB | nine rounding modes, trigonometry we do not need |
| bignumber.js 11.1.5 | 8.6 kB | the classic money library; heavier than needed |
| dinero.js 2.0.2 | 1.5 kB | integer minor units with a scale; excellent for two-decimal money, awkward for ten-decimal units and price maths; no division |
| scaled `BigInt` in-house | ~1 kB | exact and dependency-free; needs its own property-tested rounding and division |

## Decision

**big.js 7.0.1**, wrapped in `packages/core/money` so that nothing outside that module imports the library:

- Branded string types: `Money` (pay currency, two decimals at the edge), `Units` (up to ten decimals), `Percent` (four decimals), `Price`. Constructors from strings only; `number` is rejected by the types and by a lint rule in the core.
- Every public operation takes an explicit `{ dp, mode }`; default modes: `HALF_EVEN` for display rounding and money allocation, `DOWN` for coin units bought from an amount and a price, `UP` for fees owed.
- An exact-division helper avoids double rounding: truncate at the target scale, compute the remainder, and decide the last digit from twice the remainder against the divisor under the requested mode.
- `splitLargestRemainder(total, weights, minorUnits)` returns parts that sum exactly to `total`; used for planned parts and fee shares (`docs/DOMAIN.md` §3.4).
- Storage, sync payloads and export files hold decimal strings; the core never emits `number` for amounts, units or percentages.
- Formatting happens once, at the edge, by passing the decimal **string** to `Intl.NumberFormat.prototype.format`, which uses the exact value of a string (Intl.NumberFormat v3: Chrome 106, Firefox 93, Safari 15.4, all inside Next 16's browser floor); `formatToParts` styles integer and fraction parts separately. `Number()`, `parseFloat` and `toFixed` are banned outside `packages/app/lib/format` and the numeric-input parser.

## Consequences

- Property tests (fast-check): `sum(split(total, weights)) === total`; `units × price` rounds consistently under each mode; `format(parse(x)) === x` for the supported locales; associativity of money addition.
- Golden tests against the prototype compare at two decimals for money and eight for units, because the prototype's floats are not exact.
- The `BigInt` in-house variant remains the documented alternative if a dependency-free core is ever preferred; the wrapper's API would not change.

## Disagreement

None; the brief named decimal.js or big.js and big.js is the smallest adequate choice.

## Corrections recorded on 2026-10-18

The decision stands; these statements of the text above are not true of the repository, and are
corrected here instead of rewritten (`docs/ADR/README.md`).

- **Decision, first bullet: "`number` is rejected by the types and by a lint rule in the core".** No
  lint rule checks it: the core's Biome override has none (`biome.json`), and the core runs no
  ESLint (`eslint.config.mjs`). A `number` is rejected at typecheck by the branded string types and
  at run time by big.js strict mode (`packages/core/src/money/decimal.ts`).
- **Decision, last bullet: "`Number()`, `parseFloat` and `toFixed` are banned outside
  `packages/app/lib/format` and the numeric-input parser".** The lint covers only `toFixed` and
  `parseFloat`: an ESLint `no-restricted-syntax` rule over the hosts, `packages/app` and
  `packages/ui` forbids them outside `packages/app/src/lib/format`, which also holds the
  numeric-input parser (`number-input.ts`); in the core the ban is a review rule
  (`eslint.config.mjs`, `docs/ENGINEERING.md` §1.2). No rule checks `Number()`.
