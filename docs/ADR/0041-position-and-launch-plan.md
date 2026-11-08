# ADR-0041: Position and launch plan

Status: Accepted · Date: 2026-10-17 · Deciders: owner (2026-10-17); recorded by the growth session · Amends ADR-0002 (the store apps may ship before accounts), ADR-0007 (CSV import for the launch exchanges in M2, not M4) and ADR-0008 (Portuguese and German at the launch, not in M3)

## Context

`docs/GROWTH.md` sets out how the app is positioned, released and marketed from October 2026 to
October 2029. The owner accepted it on 2026-10-17, after asking for a launch within weeks rather than
in 2027. Three facts shaped it. Exchanges and wallet apps already show holdings and profit (Ledger
Wallet since 2026-07-08, Trezor Suite since v26.8.1), so a tracker with a calm name would have no
reason to exist. The calm, the record across venues and the holding date per purchase are what no
competitor offers together (`docs/research/market-data-competitors.md` §3.4–3.5). And a monthly
app can show that people return only after two or three months, whatever the build speed.

## Options considered

1. **"Just a DCA app"**: the broadest category, and no reason to choose it over an exchange's
   recurring buy.
2. **"The best strategy to build wealth with less risk"**: banned words, untrue, and the legal
   exposure named in `docs/research/legal-regime.md` §1.4.
3. **A DCA planner, calm in character, whose difference is the record**: every purchase kept with its
   date and price across exchanges and wallets, and the day each one passes the holding period;
   launched quietly within weeks, and loudly once the first users return.

## Decision

Option 3, as written in `docs/GROWTH.md` §2 and §3.

- The category is "DCA planner"; the name carries the calm; the front door is the record and the
  dates, never holdings and profit.
- Portugal and Germany first; English for everyone else outside the UK.
- Release: the web app and the site in English, Portuguese and German in late November 2026, with
  free CSV import for the main exchanges of both countries; the store apps in January 2027; accounts
  and sync once their tests pass; the loud launch in February or March 2027, only if at least 50 % of
  the first users logged their second month and 40 % their third; Plus in the second quarter of 2027.
- The five roadmap changes of `docs/GROWTH.md` §3.3 are applied to `docs/ROADMAP.md`.
- Marketing promotes the software, never a crypto-asset, and follows `docs/GROWTH.md` §2.8 and §5.

## Consequences

- `docs/GROWTH.md` is the reference for positioning, channels, targets and decision rules; its §6
  rules change the plan when the numbers say so.
- M2 grows: Portuguese and German, CSV import for the launch exchanges, public and indexable pages.
  M3 may ship the store apps before accounts.
- The dates are targets; `docs/ROADMAP.md` still promises order, not dates.
- The decisions still open are listed in `docs/GROWTH.md` §9.

## Disagreement

None.
