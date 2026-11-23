# ADR-0009: Templates, not recommendations

Status: Accepted · Date: 2026-10-16 · Deciders: owner (before the session); recorded by the planning session

## Context

The prototype shipped the owner's own plan as "the recommended strategy" (BTC 40 / ETH 30 / SOL 15 /
LINK 15, buy monthly through the 2028 halving, hold 365 days, sell June to October 2029 in three
parts). Proof of Calm must never tell a specific person what to buy: that is the line between information
and advice under MiCA and under the UK financial-promotions regime (`docs/LEGAL.md`), and it is the
product's honesty position. People still need a starting point; a blank plan is the worst onboarding.

## Options considered

1. **One default plan** presented as recommended. Fast; advice-shaped; one person's habits as the
   product.
2. **No templates**, custom only. Honest; empty-canvas onboarding; most people abandon.
3. **Several templates labelled "starting points"**, each with a risk label and a plain explanation of
   why someone would pick it and what can go wrong; the owner's plan is one of them, called the
   "Cycle plan".

## Decision

Option 3. At minimum: "Bitcoin only, never sell", "Two coins, conservative", "Cycle plan",
"Accumulate without a sell window" (`docs/DOMAIN.md` §5). Never personalise, never rank, never use the
words recommended, safe, guaranteed or wealth. The holding rule always comes from the user's country,
the amounts always from the user.

## Consequences

- Template copy goes through the copy-review checklist (`docs/CONTENT-STYLE.md`) and the banned-words
  lint; "conservative" in the second template is explained as relative to the other templates.
- A template with dates (the Cycle plan) carries `validUntil`; after that date the app asks for dates
  instead of filling them.
- The Plan page says "your own plan" as soon as the user changes anything; `templateId` stays for
  history only.
- Templates are content (`packages/content/templates`), validated by a schema, with their own
  "last reviewed" date because the Cycle plan's assumptions age.

## Disagreement

None. The session notes that the Cycle plan is the least neutral template (it encodes a forecast
about 2029) and that its explanation must say so in the first sentence.

## Deviations

- **2026-10-20, three templates renamed for their structure; signed off by the owner on 2026-10-21.** Counsel
  and brand read the names on the onboarding screen, the first screen that shows them, and found
  three of the four above breach the copy rules: "Bitcoin only, never sell" puts an asset name beside
  an imperative about holding (`docs/LEGAL.md` §6, question 1, a perimeter breach); "Two coins,
  conservative" reads as a safety or suitability claim wherever the explanation is not shown
  (question 2, a breach; `docs/CONTENT-STYLE.md` §2 and §6); "Accumulate without a sell window" leads
  with an imperative about buying (`docs/CONTENT-STYLE.md` §2, last row; `docs/GROWTH.md` §2.5
  rejected a motto for the same word). The names are now "Bitcoin only, no sell window", "Two coins,
  no sell window" and "Three coins, no sell window"; the explanation of the second states its
  structure instead of explaining "conservative", so the consequence about that word above no longer
  applies, and it no longer sets its coins' falls against Solana's and Chainlink's, which implied the
  safer pick once the word was gone (counsel and brand, 2026-10-21). The Cycle plan, every split,
  date, coin and risk label are unchanged. The owner signed the three names and the explanation off
  on 2026-10-21 (`reviewedBy: owner`, `docs/CONTENT-OPS.md` §1), after a check of the drawdown
  figures against market data: each runs from the 2021 intraday high to the 2022 intraday low, so
  Bitcoin's 78 % sits at the top of the 76 to 78 % that closing prices give. The highs and lows, as
  the templates' `drawdowns` cite them: Bitcoin 10 November 2021 to 21 November 2022, Ethereum
  10 November 2021 to 18 June 2022, Solana 6 November 2021 to 29 December 2022, and Chainlink
  10 May 2021 to 12 May 2022.
- **2026-11-02, Chainlink's fall runs to 10 June 2023.** The figure above stopped where its response
  did: `limit=730` from 1 January 2021 ends on 31 December 2022, so 12 May 2022 was that year's low and
  not the fall's. Bitstamp's low is $4.83 on 10 June 2023, 91 % below the high of 10 May 2021. The
  explanation, the drawdown row and the band follow it; the other three falls hold. A fall now runs to
  the lowest low before the coin regains its high (`docs/CONTENT-OPS.md` §7). The owner delegated this
  change with the read (ADR-0015 Deviations).

## Readings

- **2026-11-23, the product's own example images name no coin.** Decided on the owner's delegation
  of 2026-11-18; not the owner's own review or signature. It keeps the Decision ("Never personalise,
  never rank") and counsel's ruling of 2026-11-15 (#17).
  - The rule: no example image the product makes (the manifest screenshots, the landing page, store
    listings, posts, the press page) names a coin of the catalogue. No image shows a plan's coins, a
    template card, a coin chip, a country card that names a coin, or a chart of falls.
  - Placeholder coins ("Coin A") are not used: `docs/RELEASE.md` asks for screenshots from the real
    app, and a coin outside the catalogue was never rendered on Today or the Log.
  - Counsel's other rules for every example image stand (#17, rules 2 to 6). No sell window, or none
    in 2029. The figures that may show are the monthly and starting amounts, invested totals, units,
    counts, buy dates and the holding date, with "Computed from your dates, not tax advice" and the
    country's date line in frame as the app renders them. No P/L, return, percentage change, value
    chart or value above invested; no Red day banner and no fall figure; no gain or loss on a sale
    row and no line that applies "tax-free" or a rate to the plan's units, so the sale is left out;
    no invented price under "Price data by CoinGecko" or on a real date for a named coin. No
    disclaimer, banner, risk line or past-performance line in or on the image. Each label says what
    the screen is and that the data is an example, in sentence case, in about 10 words or fewer,
    without "your", and passes the banned-words lint. `manifest.webmanifest` stays inside the GB
    route, and the image files live under a path that route covers, never `icons/` or `assets/`,
    with a request test in `apps/web/e2e/uk-block.spec.ts` that expects a 451 for one of them. A
    store listing that reuses the images gets no UK storefront (ADR-0029).
  - The set that shows the app in use: Today with the current month recorded and no price answer (it
    shows Invested, the next buy day and the plan strip), from a seeded plan with no sell window and
    no template's dates; the Learn index; Portugal's country page (checked on 2026-11-19 to hold no
    catalogue coin's name; Germany's names two in its pending change); the public holding-date page
    with a result for Portugal. A capture spec counts catalogue names and tickers in each page's
    text and passes only on zero. Counsel and brand read each image before it ships.
  - The cost, stated: no image shows the Log, a buy day or the record across venues, so the
    listing's words carry that difference (`docs/GROWTH.md` §2.1 and §4.6).
  - A change (named coins under conditions, for the store listings) is the owner's own decision with
    counsel's read, as a new dated entry here, before the store listings are made.
