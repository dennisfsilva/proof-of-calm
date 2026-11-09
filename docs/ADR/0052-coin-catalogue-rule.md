# ADR-0052: The coin catalogue follows a published rule

Status: Accepted · Date: 2026-11-09 · Deciders: the owner, from session 14's analysis (#8)

## Context

The coin catalogue `packages/content/coins.json` holds 26 coins: AAVE, ADA, ARB, ATOM, AVAX, BNB,
BTC, DOGE, DOT, ETH, HYPE, LINK, LTC, NEAR, OP, PEPE, POL, RENDER, SOL, SUI, TAO, TON, TRX, UNI, XLM
and XRP. It is the prototype's own pick (ADR-0036's Reading of 2026-10-20, "The allow-list").

- It sets which coins a person can plan and log: onboarding's coins step, the plan's coin editor and
  Settings' coins tab. It is also the price route's allow-list (`apps/web/server/api.ts`).
- Stored entries accept any ticker (`CoinIdSchema`, `packages/core/src/schema/ids.ts`).
- No document sets a rule for the list. PEPE is in, while BCH and SHIB, usually in the top 30 by
  market value, are not. A hand pick reads as an endorsement, which ADR-0009 rules out.
- The reference closes (ADR-0036, `packages/data`) are to be the source of the tax-year files'
  values: no downloaded file holds values derived from CoinGecko data (ADR-0036's Reading of
  2026-11-08). ADR-0036 scoped the reference closes to BTC, ETH, LINK and SOL.
- France's file needs every coin held: form 2086 line 212 counts all digital assets, in any wallet.
  The Dutch value on 1 January counts all crypto. A coin without reference closes leaves those files
  incomplete.

## Options considered

1. **(a) Keep the hand-picked list.** Low coverage; calm; prices correct. It reads most as a
   recommendation. Tax-file values for 4 coins. The lowest cost.
2. **(b) A published rule of about 100 coins.** Covers almost every realistic monthly plan; calm;
   prices correct. It reads least as a recommendation, since the rule is neutral. Tax-file values for
   every coin, given the listing requirement. Costs CoinGecko's Basic plan and a quarterly review.
3. **(c) Any coin CoinGecko lists, found by search.** Covers everyone, but brings thousands of tokens
   and scams into the picker. Price correctness is weak: the same tickers on thin markets, and scam
   tokens shown beside the app's prices. Tax-file values mostly empty. Price calls are unbounded and
   the route becomes an open proxy.
4. **(d) The rule, plus unpriced "other coins"** (units and cost only). Covers everyone's records;
   calm; unknown coins show units only. Reads least as a recommendation. Tax-file values for the
   priced coins. Costs (b) plus a storage change.

## Decision

Option (b) now, (d) later if requests show the need, (c) never.

- **In:** about the 100 largest crypto-assets by market value (CoinGecko's ranking) that at least one
  of Kraken, Bitstamp or Coinbase lists against EUR or USD.
  - The listing requirement is the safety line: it keeps prices reliable, and it lets every
    catalogue coin get reference closes.
  - The size is a tidiness parameter and may be raised.
- **Out:** stablecoins and other fiat-pegged tokens, and wrapped, bridged and staked tokens. These are
  not separate assets, and staking is on the never list of `CLAUDE.md`.
- **Retired, not removed:** a coin that leaves the rule stays in the catalogue, marked retired. Its
  prices continue, so no one's entries are orphaned; the picker no longer offers it for new plans.
- **Review:** every quarter. A script proposes the diff from CoinGecko's ranking and the three
  exchanges' listings, with decimals per asset (`docs/DESIGN.md` §5 rule 7). A content PR applies it,
  with its sources dated.
- **The picker:** sorted by name, with a search field. It never shows rank, price or change.
- **"Missing a coin?":** a line in the picker opens an email to the owner's contact address. It
  tracks nothing (ADR-0028); its requests are the evidence for the size and for option (d).
- **The build:** it runs the unanchored design check first (blind designers, plus a walk along the
  app's defaults). That check may tune the size and the exchange set, not the shape of the rule.

This supersedes two parts of ADR-0036: the four coins its reference closes were scoped to, and the
hand-picked allow-list its Reading of 2026-10-20 records. The reference closes cover every catalogue
coin that Kraken, Bitstamp or Coinbase lists, and each coin's start date in the UI comes from the
dataset rather than from ADR-0036's list of four.

## Consequences

- The letters to Kraken and Bitstamp (`docs/research/letters/kraken.md`,
  `docs/research/letters/bitstamp.md`) ask for the rule's scope, and Bitstamp's asks that the
  agreement cover coins added under the same rule.
- The reference closes (#13) cover every catalogue coin that the three exchanges list, served per
  coin rather than bundled.
- CoinGecko's Basic plan (about $35 a month, ADR-0036) becomes necessary before launch: at full use,
  about 100 coins can pass the Demo plan's 10,000 calls a month. #21 takes that yes or no.
- Today's 26 coins stay. The first review applies the rule and lists any coin it retires.
- Option (d) returns only through a new ADR, with the requests from "Missing a coin?" as its
  evidence.

## Disagreement

None.
