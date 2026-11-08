# ADR-0050: The CoinGecko credit is unlinked, at 14 px or larger

Status: Accepted · Date: 2026-11-06 · Deciders: the build session, on the owner's delegation (#350)

## Context

ADR-0036's rules ask for "Price data by CoinGecko" (≥ 10 pt, linked) under live prices. Every credit
the app shows is unlinked and set at `text-13`, in the line beside the data it credits: Today's prices
line, and the Portfolio's source line and credit. The words are in
`packages/app/src/features/today/messages/en.json` and
`packages/app/src/features/portfolio/messages/en.json`. 13 px is 9.75 pt. Counsel found the gap on
2026-11-05 (#350), and the owner delegated the decision on 2026-11-06.

CoinGecko's pages, re-read on 2026-11-06 (`docs/research/market-data-competitors.md` §1.5), say this:

- The API Terms (version of 5 Sept 2025) bind the attribution: "displaying prominently the message
  "Powered by CoinGecko" in a legible font (an example of a legible font type being "Arial") no
  smaller than font size 10". They name no unit and ask for no link.
- The brand attribution guide accepts "Price data by CoinGecko". It shows each accepted phrase linked
  to coingecko.com and placed close to the data. Its only link rule is for the logo, which the app
  does not use, and it sets no size.

## Options considered

1. **Linked, at 14 px**, as ADR-0036 reads. This matches the guide's examples. But it puts
   CoinGecko's market pages, its news and its exchange buttons one tap from Today, and the product's
   promise of no noise keeps those out (ADR-0013).
2. **Unlinked, at 13 px**, as built. Nothing changes, but if "font size 10" means points, 13 px falls
   short by a third of a pixel (10 pt is 13.33 px).
3. **Unlinked, at 14 px.** This meets the terms whichever unit is meant, and it opens no door to market
   noise.

## Decision

Option 3. Every CoinGecko credit reads "Price data by CoinGecko", unlinked, in the line beside the data
it credits, at `text-14` (14 px, 10.5 pt) or larger. This supersedes the word "linked" in ADR-0036's
rules; their "≥ 10 pt" stands. A credit added later, such as the Log form's (#278), takes the same form.

## Consequences

- The 14 px change makes the Today and Portfolio visual baselines stale. So it ships with the next
  change that refreshes those baselines, and before launch at the latest (#285). That way the owner
  reviews one set of new baselines, not two.
- If CoinGecko asks for a link, the link returns through a new ADR. The words and their place stay.
- ADR-0036's paid plans carry the same clause, so this decision holds on every plan.

## Disagreement

None.
