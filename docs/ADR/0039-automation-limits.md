# ADR-0039: Automation limits: no orders, no exchange keys, no address watching; CSV import in the free core

Status: Accepted · Date: 2026-10-17 · Deciders: owner (2026-10-17); recorded by the growth session · Amends ADR-0007 and ADR-0010

## Context

The monthly tap (ADR-0003) is the main friction for people whose exchange already buys for them, and
the product's difference is a record of every purchase across exchanges and wallets
(`docs/GROWTH.md` §2). On 2026-10-17 the owner asked whether three automations would remove that
friction: the app placing the DCA buys through exchange APIs, reading purchase history through
read-only exchange keys, and watching wallet addresses for incoming coins. The facts that decide it:

- MiCA lists "execution of orders for crypto-assets on behalf of clients" and "reception and
  transmission of orders for crypto-assets on behalf of clients" as crypto-asset services
  (Art. 3(1)(16)(e) and (g); `docs/research/legal-regime.md` §2.1). Both sit in class 1 of Annex IV,
  with a minimum capital of EUR 50,000. The position in `docs/LEGAL.md` §2 holds only while the app
  provides none of these services.
- Apple's guideline 3.1.5(iii) lets apps facilitate crypto transactions only where they hold the
  licences to do so. The Stripe application of ADR-0038 describes the product as "no execution".
- Exchange keys leak. 3Commas confirmed on 2022-12-28 that attackers held its users' exchange API
  keys, about 100,000 of them; users reported millions lost to trades they did not make, and 3Commas
  said phishing also played a part.
- Lists of who holds crypto get people hurt. A breach at Waltio, a French crypto tax tool, exposed
  about 50,000 users' emails, gains and balances in January 2025, and a violent attack in France was
  reported to have followed it. France counted its tenth "wrench attack" of 2025 by June.
- Wallet apps already show profit and loss (Ledger Wallet since 2026-07-08; Trezor Suite since
  v26.8.1), but a wallet sees coins arrive, not what was paid or when they were bought. In Portugal
  and Germany the purchase date decides the tax (`docs/JURISDICTIONS.md` §7.6, §7.7).
- Read-only APIs would not cover every broker German savers use: Trade Republic has no public API.
- The planned Risk page tells users the app "never asks for keys or money" (`docs/LEGAL.md` §5).
  Asking for keys would teach users the pattern a fake copy of the app would exploit.

## Options considered

1. **Place orders** through the user's exchange API keys on the plan's schedule.
2. **Read purchase history through read-only keys**: (a) stored by us; (b) through a vetted
   aggregator (ADR-0007, option 2); (c) held only on the user's phone in the store apps.
3. **Watch wallet addresses** or extended public keys and turn incoming coins into entries.
4. **No keys and no addresses**: the one-tap estimate (ADR-0003); CSV import of exchange exports
   that replaces the matching estimates with the exchange's figures; a "moved to my wallet" step; a
   yearly check of units against the exchange and the wallet.

## Decision

Option 4.

- The app never places, schedules or transmits an order, in any version. Recurring buys stay with the
  exchange.
- The app never asks for or stores exchange credentials. Option 2 stays closed: it can be reopened
  only by a new ADR, only through (b) or (c), only with a threat-model update in `docs/SECURITY.md`,
  and only if measured data shows that people stop using the app because of logging.
- The app never asks for wallet addresses or extended public keys and never queries a blockchain
  about a user's holdings. Reopening this needs a new ADR.
- CSV import of exchange exports is part of the free core. This supersedes the "CSV import" item in
  ADR-0010's Plus list; Plus keeps sync, reminders, multiple plans and reports.
- An import shows its preview, then replaces the matching one-tap estimates (same coin, same buy day,
  still labelled as estimates) with the exchange's units, price and fee. It never deletes or
  overwrites an entry the user typed or edited.
- A "moved to my wallet" step records that units moved from one venue to another. It changes no
  acquisition date and no cost, and it keeps the per-venue lot matching of Portugal (per platform)
  and Germany (per wallet) right (`docs/DOMAIN.md`, `lotScope: 'per-venue'`).
- The yearly review (ROADMAP M2) asks the user to compare the units per venue with what the exchange
  and the wallet show.

## Consequences

- `docs/LEGAL.md` §2 stays true, and the Stripe application of ADR-0038 stays accurate.
- "Never asks for keys or money" stays true and doubles as a marketing line and a scam defence
  (`docs/GROWTH.md` §2.7).
- ROADMAP: M2 gains the "moved to my wallet" step, specified in `docs/DOMAIN.md` before the work
  starts; the M4 import is free and reconciles estimates.
- `CLAUDE.md` and `docs/BUILD-PROMPT.md` list order placement, exchange keys and wallet addresses as
  never-add items, so no session drifts into them.
- Competitors with API sync will look more convenient. The answer is the import, the one tap and the
  trust position stated in Learn's "Start here" (ADR-0007).
- Not decided here: from M3 the synced purchase log is readable on the server until client-side
  encryption ships in v2 (ADR-0030). The same breach evidence argues for bringing that forward; it is
  an open question in `docs/GROWTH.md` §9.

## Sources

- MiCA, Annex IV, through ESMA's interactive single rulebook,
  https://www.esma.europa.eu/publications-and-data/interactive-single-rulebook/mica/minimum-capital-requirements-crypto-asset,
  accessed 2026-10-17.
- Apple, App Store Review Guidelines, 3.1.5(iii), https://developer.apple.com/app-store/review/guidelines/,
  accessed 2026-10-17 through search results; read the guideline itself before the store submission.
- BleepingComputer, "Crypto platform 3Commas admits hackers stole API keys",
  https://www.bleepingcomputer.com/news/security/crypto-platform-3commas-admits-hackers-stole-api-keys,
  accessed 2026-10-17.
- The Block, "France hit by 10th crypto 'wrench attack' of 2025",
  https://www.theblock.co/post/359010/france-hit-by-10th-crypto-wrench-attack-of-2025-as-kidnappers-target-23-year-old-near-paris,
  accessed 2026-10-17; the Waltio breach and the attack that followed it as reported in 2025
  coverage (secondary).
- Ledger, "Release Notes: July 8th, 2026", and the Trezor Suite releases v26.8.1 and v26.8.2, as
  cited in `docs/GROWTH.md`.

## Disagreement

None.

## Corrections recorded on 2026-10-18

The decision stands; the text above stays as accepted (`docs/ADR/README.md`). This statement in it
was wrong on 2026-10-18, with the fact and where it can be checked.

- **Consequences, "`CLAUDE.md` and `docs/BUILD-PROMPT.md` list order placement, exchange keys and
  wallet addresses as never-add items".** Of the two, only `CLAUDE.md` lists them, in its conventions.
  Since #40, `docs/BUILD-PROMPT.md` points to `CLAUDE.md` for what never gets added (ADR-0010,
  ADR-0013, ADR-0039), and agents read both, so no session drifts into them.
