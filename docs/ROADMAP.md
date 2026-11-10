# Proof of Calm roadmap

Milestones, each with what "done" means and the tests that prove it. Launch is after M2. Nothing
ships with a known defect (`docs/RELEASE.md`). The rule for adding anything: it removes a tap from the
monthly loop, prevents a costly mistake (tax, data loss, a missed month), or answers "where am I"
faster. When in doubt, cut.

The build session works milestone by milestone, in order, keeping every gate green and the documents
current. Dates are not promised here; order is.

---

## M0 — Scaffold, tokens, core port with tests

**Done when**

- The monorepo exists as described in `docs/ARCHITECTURE.md`: `apps/web`, `apps/mobile` (static-export
  skeleton), `packages/app`, `packages/core`, `packages/ui`, `packages/content`, `packages/config`,
  `tools`; pnpm workspaces with the single-version catalog already pinned in `pnpm-workspace.yaml`;
  Turborepo tasks `build`, `typecheck`, `lint`, `validate`, `test`, `test:e2e`, `storybook:test`;
  the static-export build of `apps/mobile` is a required CI check from the first PR.
- Housekeeping found by the research: the domain served the unmodified "Create Next App" scaffold
  with no mail records; M0 replaced it with a `noindex` holding page and added SPF and DMARC records
  so the domain ages before M3's emails (`docs/OWNER-SETUP.md` §4, ADR-0026).
- `packages/core` implements `docs/DOMAIN.md` end to end: schemas (zod), slots, statuses, actions,
  one-tap fill, phase, portfolio, eligibility and lots, tranches, transactions, totals, value series,
  drawdown and Red day, reminders and review, export and import, the prototype importer, templates
  loading, country-profile consumption. 100 % statement and branch coverage, enforced in CI.
- `packages/ui` holds the design tokens as the single source (OKLCH CSS variables for light and dark
  per `docs/DESIGN.md`), the Tailwind preset that exposes them, the restyled shadcn primitives needed
  by M1 (button, input, select, dialog/sheet, tabs, toast, segmented control, table, chip, progress
  strip), and Storybook with the a11y addon and phone and desktop viewports for every component.
- `apps/web` boots: the Today route renders the empty state with tokens applied, light and dark,
  installable manifest present, security headers and CSP set, i18n wired with English messages.
- CI on every PR runs the gate (the jobs and what each proves: the header of
  `.github/workflows/ci.yml`), including the visual snapshot of the empty Today page in light and
  dark and Lighthouse against the Vercel preview with budgets.
- `CLAUDE.md` documents the commands; `docs/ENGINEERING.md` is enforced by the lint and CI config it
  describes.

**Proven by**

- Core: unit tests for every exported function; property tests for slot generation, planned-parts
  splitting (parts sum to the whole), eligibility (monotonic in `today`), portfolio (invariants under
  reordering of entries, P/L identity `value + proceeds − invested`), lots (FIFO conservation);
  golden tests against the prototype fixtures (§7 of `docs/DOMAIN.md`); date tests from §8.
- A failing coverage threshold fails CI (prove it once by lowering coverage on a branch).
- Storybook: every component has stories at 360 px and 1280 px, light and dark; axe passes.
- Playwright: Today empty state on all seven projects; no horizontal scroll assertion; a11y scan.

**Not in M0**: any real screen beyond the empty Today, prices, storage.

---

## M1 — The app, local-only

**Scope**: onboarding (country first), Today with one-tap logging, the log form (edit, delete with
undo), skip a month, pause, end buying, Log, Portfolio, Plan, Settings (four tabs), JSON export and
import, CSV export, migration from the prototype, country profiles for Portugal, Germany and the
generic no-exemption profile with their jurisdiction cards, prices through the server-side cache,
installable PWA working offline with "prices from <time>", calendar reminder (`.ics`) as the
account-free reminder, legal pages, no account yet.

**Done when**

- Onboarding: country suggested from locale and timezone and confirmed with one tap; template or
  custom; monthly amount, first buy, optional starting amount with the currency set by the country;
  custom path: coins and split, then dates; the user's one sentence; reminder step offers "Add to
  calendar" (an `.ics` with the monthly recurrence on the buy day) and "Later" (the email option
  arrives in M3); summary; start. Every screen can be abandoned without losing typed values (draft kept
  in session storage). Fewest screens that keep each decision explicit.
- Today: the one primary action with coin chips and a single "Bought as planned" button that creates
  the entries with the day's prices and opens them for editing; late months in a quiet list; the
  portfolio number; the Buy/Hold/Sell strip with a today marker; at most one banner (Red day is M2;
  in M1 only "backup needed"). Paused and ended plans render their states.
- Log form: slot preselected to the nearest due slot; fee defaults to the last fee; numeric keypads;
  per-coin amount, units and implied price with the prototype's three-way fill; an optional venue
  label (collapsed under "more", remembered from the last entry) because Portugal matches lots per
  platform; sale validation and the holding warning; edit; delete with an undo toast; skip with a note.
- Log: one row per transaction, expandable, last 12 then "show all", month headers, skipped rows.
- Portfolio: value chart with one global range selector, allocation bar, holdings table of held coins
  only with expandable rows (per-coin chart with buy markers and average line), "not bought yet" line.
- Plan: the reference text, the milestone timeline (SVG on desktop, list on phones), sellable-now lines
  in the sell phase, the edit button.
- Settings: Plan, Coins & split, Hold & sell, Currency & data; country change with the explicit
  re-derivation summary; data tab with export, import, CSV, "delete everything".
- Storage: IndexedDB with versioned schema and migrations; export is the backup format; import offers
  replace or merge; `navigator.storage.persist()` requested after the first entry; the quiet persistent
  line about durability appears once entries exist (the durability line of
  `docs/CONTENT-STYLE.md` §3, in its M1 wording).
- Prototype migration: paste or upload the `dcaplan.v1` JSON (and auto-detect it in `localStorage` when
  the app is opened on the same origin as the prototype, which it will not be; so upload/paste);
  the import report lists adjustments; golden numbers match.
- Prices: the `/api/prices` endpoint with server-side caching and the key server-side; client cache
  with timestamps; offline shows the last prices with "prices from <time>"; manual prices remain
  possible as a fallback.
- Country: profiles PT, DE, XX in `packages/content` validated by the schema; jurisdiction card with
  last-reviewed date and sources; holding rule applied per profile; XX hides "tax-free from".
- PWA: installable on Android and iOS (home screen), app shell precached, update prompt, works offline
  for everything except fresh prices.
- Legal: the Terms, Privacy, Risk disclosure, Cookie-free statement and Contact/Impressum pages in
  place (their full text is M2's launch readiness), `security.txt`, the "not advice" line where
  `docs/LEGAL.md` says.
- i18n: all strings externalised; number and date formatting driven by the country profile; English only.
- Performance: Today total script transfer ≤ 160 kB brotli with application code ≤ 45 kB (ADR-0005,
  `docs/ENGINEERING.md` §4); Lighthouse mobile ≥ 95 on Today, Portfolio, Log, Plan.

**Proven by**

- Playwright flows on all seven projects: onboarding (template path, custom path, abandon and resume),
  one-tap log, manual log, edit, delete with undo, skip, pause and resume, end buying, export and
  import (replace, merge), prototype migration, country change, sell-phase screens (with a fixed
  clock), offline (service worker, prices from cache; on the desktop project only, since the worker
  does not depend on the viewport), settings tabs, keyboard-open form usability
  (`docs/ENGINEERING.md` §3), 125 % text zoom project, reduced-motion project.
- Visual snapshots per screen per viewport in light and dark; axe on every page; no horizontal scroll
  assertion everywhere; touch targets ≥ 44 px assertion on interactive elements.
- Component tests for every stateful component (form, coin editor, range selector, toast with undo).
- Core golden tests pass with the owner's migrated data; the migrated Today page shows the same primary
  action the prototype shows on the same date.
- Lighthouse CI budgets enforced on the preview deployment.

**Not in M1**: accounts, sync, email, Learn modules beyond a placeholder screen, Red day, simulator,
tax-year export, jurisdictions beyond PT/DE/XX, CSV import, payments. Cut from M1 by its gate
session (2026-10-26): the legal pages' full text and the Risk page's dated drawdowns, Learn's "Why?"
sheet and its links, the `nextReviewDue` cards and the per-rule source key (M2); the Capacitor host's
external links and the Risk link in the mobile export (M3).

---

## M2 — Education, templates, the full jurisdiction set, tax-year export, Red day, simulator

**Done when**

- Learn: the seven modules as MDX in `packages/content` with reading time, "last reviewed", one caveat
  each, at most one chart; the index page; contextual "Why?" links open the module in a sheet without
  leaving the screen (tax-free date, sell window, hold phase, three parts, drawdown): the sheet and
  the hold phase's link built on 2026-11-02 (#310), the others with their modules (`docs/EDUCATION.md`);
  Noise and When the market drops built on 2026-11-09 (#61), with the drawdown's link as the fall
  page's Why?, and a module's one chart drawn through `<Chart />` the same day (#62); Risk honestly
  with Portfolio's P/L link built on 2026-11-09 (#69), the chart's falls named as Proof of Calm's own
  computation the same day (#68).
- Templates: the four starting points with risk labels and explanations; the template picker copy
  passes the copy-review checklist (`docs/CONTENT-STYLE.md`).
- Jurisdictions: PT, DE, NL, ES, FR, IT, BE, IE, GB, US, XX as validated data with sources and dates;
  the country library in Learn, built on 2026-11-05 (#329), its country card on 2026-11-03 (#324); the tax-year export aligned to the country's tax year and shaped by
  its computation model (per lot, with a raw listing for the lot rules the app does not match, built on
  2026-11-07 in Settings' Your data, #33; France's portfolio-wide cessions with the estimated portfolio value
  at each sale and the Dutch 1 January snapshot, their core built on 2026-11-08 in
  dennisfsilva/proof-of-calm-archive#388, dennisfsilva/proof-of-calm-archive#389, #38 and #39 and offered in
  Your data the same day, their value cells empty until the reference closes of `packages/data` (#13) fill
  them, ADR-0036 Readings, 2026-11-08); the "Value on 1 January" line on Portfolio for Dutch
  users, built on 2026-11-08 (#40); holding-rule conditions shown beside the first date on the Log and the Plan (Portugal's
  counterparty rule), built on 2026-11-02 (#312); the dated
  rule-change notice, built on 2026-11-03 (#320); the "under review" state when `nextReviewDue` is more
  than 12 months past, on every jurisdiction card (the earliest trigger is DE's, on 2028-01-02), built
  on 2026-11-03 (#318); a per-rule source key in
  the jurisdiction schema, so each rule's "Sources" link no longer takes the profile's first source;
  UK handling per ADR-0029.
- The review pipeline: the scheduled agent job that compares stored rules with official sources and
  opens a PR with diff, sources and confidence (`docs/CONTENT-OPS.md`), dry-run proven once.
- Red day: thresholds in core with tests; the page with the plan's current drawdown next to past cycle
  drawdowns and the user's sentence, built on 2026-11-09 as the fall page (#51, `docs/EDUCATION.md`
  §6); the banner, once per episode, highest priority, built on 2026-11-09 (#52, `docs/DOMAIN.md`
  §3.11).
- Simulator: monthly buying into a split from date A to B with the path, drawdowns and time under
  water shown, from the reference-close dataset in `packages/data` (built by the pipeline in `tools/`
  from Kraken bulk data, Bitstamp and Coinbase with ECB rates, ADR-0036) refreshed by the scheduled
  job; every catalogue coin that Kraken, Bitstamp or Coinbase lists (ADR-0052), its start date
  stated from the dataset; the caveat text. Before this work starts: the letters to Kraken (written
  confirmation) and Bitstamp (Data License Agreement) are sent and their answers recorded in ADR-0036.
- Attribution text under every price and chart per ADR-0036, shipped with the simulator.
- Annual review prompt in-app.
- The "moved to my wallet" step (ADR-0039): units move between venues without changing acquisition
  dates or costs, so per-venue lot matching stays right; the annual review asks the user to compare
  the units per venue with what the exchange and the wallet show. Specified in `docs/DOMAIN.md` first.
  The reader built on 2026-11-09 (the entry kind `move`, ADR-0054; #82); the Log step that records a
  move follows one release later (#87, `docs/RELEASE.md`, Versioning).
- Purchases off the schedule (decided 2026-11-05 and revised the same day after an independent
  check, #350; session 12a; the behaviour specified in `docs/DOMAIN.md` §3.10 and §6), built on
  2026-11-06. The sheet of `Record a purchase` offers the open action's kind (`Monthly buy`, or
  `Starting amount` while the starting amount is open), then `Extra buy`, then `Sale` while a coin
  is held, the open action preselected, so the monthly loop keeps its taps and an extra buy is
  reachable on any day (#355). Units typed beside a price fill the amount, as the form's hint says
  (#356). The price the form fills belongs to the day the form opened: an earlier date empties it
  and the figure derived from it, and a line asks for the units and what was paid, from the
  exchange's confirmation (#356). The Plan's totals count extra buys dated on or after the first
  buy day (#354), and a line under them says so while an earlier one exists (#359), since the
  Portfolio and Today count every purchase as `Invested`. Where lots match per venue (Portugal,
  Germany, the United States), the sale warning counts only the lots of the sale's venue (#358).
- Coins the plan did not buy, held before it or received as a gift (decided 2026-11-05 after the
  owner asked about coins whose price nobody remembers; a session after 12a and before the CSV
  import, specified in `docs/DOMAIN.md` §2.2 and §3.6 first). They go in as their own kind (`held`,
  stored since 2026-11-06 at entries v3, `docs/DOMAIN.md` §2.2) with their units, the day they were
  bought or received or, if unsure, the latest day it might have been, where they are now, and their
  cost when it is known. The latest day is cautious for the holding rules that count days or years,
  which then start no earlier than they should, but not for the Dutch 1 January value, which counts
  the coins only from that day, and for a gift in Germany and the United States the giver's holding
  period carries over, so the day received is not the day the rule counts from. Value, lots, holding dates and sales count them; the Plan's totals never do,
  whatever their date; the invested total, the average cost and the P/L count only recorded costs
  and name the units they leave out; the tax-year export leaves such a lot's cost empty. The way
  in is a lasting entry on the Log, named by the Portfolio's "not bought yet" line and by the
  starting amount's hint at setup; it does not close the default path, since Record still
  preselects Monthly buy or Starting amount, dated today at today's price, so the new kind's own
  button and the onboarding sentence are the way out of it. Built on 2026-11-06: the Log's button
  (#369); on 2026-11-07 the Portfolio's line for the units with no recorded cost, the not-bought
  line's link to the Log and the onboarding sentence on both paths (#374). It shares one rise of the entries' version with the CSV
  import's receipt at no cost, and decides whether that receipt is this kind at cost 0. A price
  filled from a daily close for an earlier date waits for the reference closes of `packages/data`,
  decided then with counsel, and never fills the cost of these coins, whose date is a bound.
- Launch scope (ADR-0041, `docs/GROWTH.md` §3.3): pt-PT and de locales complete, reviewed by native
  readers (`docs/CONTENT-STYLE.md` §8); CSV import, free (ADR-0039), for the main exchanges of
  Portugal and Germany, chosen from research and recorded in an ADR, and a receipt at no cost in an
  export (a welcome bonus, an airdrop) recorded as coins held (`held`) with the amount 0, the one kind
  that allows it (decided 2026-11-05, the kind 2026-11-06: the invested total adds nothing, the
  average cost and the P/L count the units, the tax-year export carries the lot at cost 0, and the
  entries' version is 3, which the newer-version screen of 2026-10-30 covers; a gift is not such a
  receipt, since Germany, Italy and the United States carry the giver's cost, so it goes in as coins
  held with its cost unknown);
  the Learn modules, the country pages and the holding-date page public and indexable
  (`docs/GROWTH.md` §4.1; app screens until session 23 decides their public form, ADR-0045
  Deviations of 2026-11-05).
- Launch readiness: `docs/RELEASE.md` checklist complete for what M2 ships; Vercel Pro in place
  because the free tier forbids commercial use (ADR-0005); the UK explanatory page live (ADR-0029;
  proven by the owner's check from a UK vantage point in `docs/RELEASE.md`); the legal pages' full
  text (Risk disclosure and Cookie-free statement at launch quality, with the Risk page's dated
  drawdowns; Terms, Privacy and Contact/Impressum drafted, Contact/Impressum waiting on the owner's
  identity), live before the public launch per `docs/RELEASE.md`.
- **The name is Proof of Calm** (ADR-0040). Before anything public ships: the TMview search in
  classes 9, 36, 41 and 42 and, if it is clean, the EUTM filed in those classes (`docs/LEGAL.md` §1).
  The WebAuthn Relying Party ID is proofofcalm.com; the sending domain is mail.proofofcalm.com.
- Carried from M1, before the build that needs each: the screen for rows from a newer version, built
  on 2026-10-30 (#291); it ships in a release before any build writes plans above v3, entries above v2
  or encVersion above 0 (`docs/RELEASE.md`). Deferred, not cut:
  holding-rule overrides in the early-window check (`lastBuyEligible`, `earlyOpen`, `planIssues`, the
  prototype import) with `saleWarning`'s per-lot effect, built when the first profile holds
  `holdingRuleOverrides`; none does in M2 (DE's change is a proposal, `docs/JURISDICTIONS.md` §7.7),
  and until then `pnpm validate:content` refuses a profile that holds one.
- The disclosure's acknowledgement is asked again when the recorded wording version is below the
  current one (`docs/DOMAIN.md` §2.1 owns when, an import's case among it), built on 2026-11-02
  (#308); its tests pass a raised version, and no build reaches the screen until the text gets a
  new version.
- The manifest's screenshots per form factor and the OG image 1200 × 630 (`docs/DESIGN.md` §9),
  deferred from M1 by its stage audit on 2026-10-27.
- With counsel, decide whether an installed worker must stop serving the precached shell to a person
  now in the UK (the precached shell never meets the 451 route, and ADR-0029 accepts VPN leakage
  only), and record the decision in ADR-0029's Readings (found by the stage audit's security lens on
  2026-10-27); decided on 2026-11-05 (ADR-0029 Readings of 2026-11-05): the worker keeps serving the
  shell, nothing is deleted on a geolocation signal, and the API stays outside the block.

**Proven by**

- Playwright: each module opens from its "Why?" link and from Learn on all projects; Red day banner
  and page with a fixture price history that triggers each threshold; simulator with fixture data;
  tax-year export produces the expected CSV for fixtures in PT (calendar year), GB (6 April), FR (the
  cessions) and NL (the snapshot);
  country library pages; UK path per ADR-0029.
- Content tests: every jurisdiction file validates; every module has the required front matter;
  banned words lint on content and UI strings.
- Core: threshold boundary tests; episode tests; simulator maths (property: buying the same amount
  every month into a constant price gives the exact multiple 1.0, minus fees).

**Not in M2**: accounts and sync, email reminders, store apps, languages beyond English, Portuguese and
German, CSV import for the other exchanges, payments. Cut from M2 at its start (2026-10-30), each to
the milestone its reason names: Supabase Pro to M3, since nothing in M2 reads Supabase; error
monitoring to M3, since ADR-0027 picks the Vite host's SDK there and `docs/RELEASE.md` needs it before
the public launch, which comes after M2; backups and the restore drill to M3, since there is no server
data before it; the email domain's authentication to M3, where the provider is picked (ADR-0026,
`docs/OWNER-SETUP.md` §6); CoinGecko Basic to M5, since ADR-0036 needs it before Plus launches; and,
dropped, a mailing list to choose the CSV exchanges, which would need a third-party account and
something public. Decided against on 2026-11-05, not deferred, for coins held before the plan: an
onboarding step, a screen for everyone (a sentence in the starting amount's hint names the way in
instead); a date range, because one date keeps the form and every reader simple, and the latest
day it might have been is the cautious choice for the holding rules, so a tax-free date never comes
early (the value chart and the Dutch 1 January value then count the units from that day, which can
leave a 1 January out); a stored mark
for an estimated cost, since the app fills no cost for an earlier day and ADR-0003 labels the
one-tap's estimate (the Log's label on its units built on 2026-11-07, `docs/DOMAIN.md` §2.2); a cost filled from the close of the
latest day the coins might have been bought, which is the price on a bound, not the price paid
(BTC fell 78 % in the year to 21 Nov 2022, `packages/content/cycles/drawdowns.json`), and which
the history's last 364 closes do not reach for coins held longer. The first version of this
decision cut an unknown cost for three reasons that the check on #350 found wrong: the close is a
few percent off only on the real purchase day, the previous build's import refuses an amount of 0
as well, and every entry the Log records has the source `manual` (what an edit does to an
entry's source: `docs/DOMAIN.md` §2.2), so no export tells an estimated cost by its source.

---

## M3 — Accounts, sync, reminders, store apps

**Done when**

- At its start: Supabase Pro (eu-central-1) in place, because the free tier pauses after a week idle
  (ADR-0005); the email provider picked (ADR-0026) and the sending domain authenticated.
- Sign-in with email (one-time code or magic link per ADR-0035) and passkeys; no password, no profile.
  The account stores one thing: the plan and its log. The onboarding step reads "Where should we send
  the monthly reminder?".
- Sync per ADR-0021: offline-first, last-writer-wins per entity with tombstones, convergence proven by
  property tests; the local-only user upgrades without losing data; sign-out keeps a local copy by
  choice; account deletion removes server data within the stated period and sends a final export.
  The merge keeps `MAX_ENTRIES` (`docs/DOMAIN.md` §9). Sync brings other devices' pauses, so Plan offers
  ending an open-ended pause still to come (`resumePlan` already handles it), and other devices' ends
  while this window has the focus, so the focus is read before such a change is committed and handed on
  when it unmounts the control that held it (Pause from today, Resume, End buying). In M1 only another
  browser tab ends buying, which writes while this window is blurred; the focus then falls to `body`,
  and nothing is lost or misstated.
- The per-row write identity in the plan and entry row envelopes (ADR-0021), which M3's push maps; it
  closes M1's known undo residue (#130): a replace in another tab in the same millisecond as a delete
  writes equal stamps, and the delete's Undo restores.
- RLS policies with automated tests (no cross-user read or write possible); rate limits on API and
  auth routes; error monitoring with PII scrubbing on the Vite host's SDK (ADR-0027); backups with a
  tested restore.
- Reminder emails on the buy day in the user's timezone, idempotent, with one-click unsubscribe; the
  email opens Today with the one-tap button.
- Schema ready for client-side encryption (opaque payload column, key id, plaintext metadata limited
  to what reminders need), per ADR-0030.
- Capacitor wrappers for iOS and Android from the same code: push notifications for the buy day,
  local notifications fallback, deep links from email into the app, store listings with the honest
  description; external links (Hold & sell's "Sources", About's legal links and its Risk link) open the
  system browser, and the mobile export links the Risk page; the native Platform adapter answers
  `installed()` with true; the web build unchanged.
- The store apps may ship first as local-only wrappers with local notifications, before accounts and
  sync (ADR-0041). Features that belong to Plus are labelled "part of Plus, free until Plus launches"
  from their first day (`docs/GROWTH.md` §3.3).

**Proven by**

- Playwright: sign-in both methods (test inbox), upgrade from local to account, two-device sync
  scenario (two browser contexts), conflict scenario, sign-out and deletion flows, reminder email
  rendering snapshot, unsubscribe.
- pgTAP or integration tests for every RLS policy, including the negative cases.
- Property tests for sync convergence (random operation interleavings on two replicas converge).
- A restore drill executed and logged in `docs/SECURITY.md`.
- Device tests on at least one physical iPhone and one Android phone for install, push and deep link.

---

## M4 — CSV import

Exports from the exchanges not covered in M2 (Kraken, Coinbase, Binance and Bitvavo are the first
candidates) mapped to entries with a preview, de-duplication by
exchange id, fee handling, and fixtures from real anonymised files. Proven by unit tests per parser
and a Playwright flow per exchange.

Free in the core (ADR-0039). After the preview, an import replaces the matching one-tap estimates
with the units, price and fee from the exchange export, and never deletes or overwrites an entry the
user typed or edited.

---

## M5 — Plus tier and payments

Merchant of record per ADR-0038 and `docs/LEGAL.md` (company, VAT, refund and withdrawal handling in
place first); entitlements for sync, reminders, multiple plans and reports (CSV import stays in the
free core, ADR-0039); tips stay out of Plus's launch (ADR-0038); no affiliate links. Before Plus
launches, live prices move from the CoinGecko Demo plan to Basic ($35/month, ADR-0036). Proven by
end-to-end tests against the provider's sandbox and a manual checklist.

---

## Parallel tracks (continuous)

- Content review cadence: quarterly for the jurisdictions and the modules' facts, with a second pass
  on the jurisdictions on 15 January; a module that cites a fact last reviewed more than twelve
  months ago fails the content test (`docs/CONTENT-OPS.md` §2, §7).
- Dependency updates weekly with the full gate.
- Accessibility audit before launch and yearly (manual screen-reader pass on iOS VoiceOver and Android
  TalkBack, in addition to automated checks).
- Growth: public pages before launch, launch moments and the rules for marketing (`docs/GROWTH.md`);
  every piece of marketing passes the copy review in `docs/CONTENT-STYLE.md` §8.
