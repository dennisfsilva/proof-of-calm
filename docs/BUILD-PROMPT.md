# Proof of Calm: what this repository adds to the process

The process is the `crew` plugin: sessions run with `/crew:next-checkpoint`, `/crew:progress` shows
where things stand, and the plugin's README owns the roster, the loop, the tier model and the three
verdicts. This file holds only the repository's inputs. Commands and conventions: `CLAUDE.md`.

## Inputs the plugin reads

- Commands and limits: `.claude/crew.json` (check, gate, test, e2e, dead code, docs lint; the
  subject, branch and PR-size limits; the evaluator's two viewport projects; the content roles).
- Tiers, empirical gates and reading sets, per path: the frontmatter of `.claude/rules/*.md`.
- Content roles: `.claude/agents/counsel.md` (the perimeter, blocks a merge) and `.claude/agents/brand.md`
  (proposes).

## High-risk classes and their empirical gates (the PR body's Proof section names one)

- CI, hosting and the sensors' configuration: a run of the branch's workflow, with the run id (the
  pull request's own run for `ci.yml`, which takes no dispatch; a dispatch for the others).
- Storage and migrations, import and export: a forward read test and a rollback read test, by name.
- Money and dates (the core, jurisdictions, templates, facts): the golden fixtures, and a dated source.
- Flows and screens: the evaluator on the two projects in `.claude/crew.json`, light and dark.

## Only the owner

- Adding or updating visual baselines: their own PR, labelled `needs-owner`, never merged by a
  session. Deleting a baseline that no longer matches goes in the PR that changes the screen.
- Repository visibility, spending money, creating accounts or third-party resources, making anything
  public, anything under the owner's legal identity. Draft such items and continue with the rest.

## Brief lessons

- Briefs for content copied from a document name CONTENT-STYLE §1 and §4 and "a value holds only the
  quotable fact" up front.
- A brief that edits one list in a shared JSON file names that list's key.
- A data file's first content read takes the whole file, and a reviewer recomputes every figure
  against its source, before the first fix round; later rounds read only the diff.
- A date proposed for a fact is checked like a figure: what happened on that day, in the source, not
  when the source was published.
- A check that a stricter gate backs may refuse too much and never emulates the stricter reader; it
  reports early, and its edge cases belong to that gate.
- A module's sentences are claims about the product, so the reviewer's fact check runs before counsel
  and brand, and a replacement wording gets the same check (#305: `No buy is due` carried the flaw of
  the line it replaced).
- A keyboard step on the iphone project walks with bounded presses and asserts only the press under
  test: Linux WebKit's Tab reaches links where the Windows and macOS builds' does not, and only CI shows
  it.
- A plan that adds a surface showing profile data first checks every instrument its lines cite against
  the profile's `sources`, so the gaps land in the content PR's first round (#325 needed a third round
  for four such instruments).
- A change to how the entry form reads each row's entry (the sale warning, the save, the session
  draft) tests a grouped Log edit with two and with three sales of one coin, one row cleared, and its
  design note says which entry each row's save takes (`rowEntries` in
  `packages/core/src/actions/rows.ts`: each row first keeps its own entry, then a row with none takes
  the first unused edited entry of its coin, else a fresh id): #358 needed a rework and two more
  review rounds for these cases.
- A brief for a branch that changes a screen names the visual-baseline rule: delete in the branch
  every baseline the change no longer matches, read from the e2e seed and the visual spec, and send
  new or updated ones to the owner (#369's first CI run failed on 14 baselines its brief never named).
- A property test that guards text at separators gets a generator brief naming the edge positions (a
  trigger at index 0, right after each separator, in runs, and a character that is both trigger and
  separator), listed as the property's examples: each review round of #207's fix found one such
  position, and the last held back the tax-year export (#383).
- A constraint on generated text is checked against every source of that text, the app's own messages
  and the profile's copied sentences alike (#33).
- A requirement handed to a reviewer is quoted from the design note, never paraphrased
  (dennisfsilva/proof-of-calm-archive#387).
- A native form element on a screen the CSP specs open fails WebKit's hashed CSP (#33: a native select
  recorded a style-src-attr violation): use the ui components there, or run that CSP spec on the iphone
  project before the PR.
- A header line that describes a column is checked against the code that fills the column, not
  against the column's name. Two of #41's header lines described `purchase_costs_to_date` and
  `units_estimated` by their names. They missed costed `held` entries and the block-wide estimated
  flag. The fact check caught both after the words were written.
- A rule on when external data is final cites the vendor's documented publish time and cache. #40
  counted the close of 31 December as final from 00:00 UTC. CoinGecko publishes it at 00:10 UTC and
  caches the answer for 30 s, so #42 reworked it.
- A branch that changes what Today loads runs `lighthouse-branch.yml` before review, not only
  `node tools/size/today.ts`. today.ts counts Today's entry; Lighthouse counts every script the page
  loads. #52 passed the first (45,051 of 46,080 bytes) and failed the second (169,093 bytes over
  the script budget of `docs/ENGINEERING.md` §4). Since Today's code-splitting group lowered
  today.ts's figure, that Lighthouse run is what holds Today's scripts before a merge (§4 there).
  A branch that changes what Today runs at mount also reads that dispatch's performance median and
  total blocking time beside main's latest push run at a matched `environment.benchmarkIndex`, not
  only the script size. #52 passed its script budget and its review; only the dispatch showed
  Today's blocking time at 334 ms against main's 94 ms at the same runner speed (runs 42597401623
  and 42596180364).
- A module's `<PastPerformance />` ends its source line inside the paragraph, as
  `packages/content/learn/cycles.mdx` does. On a line of its own its `Risk disclosure` link fails
  the e2e matrix's touch-target check (#61's first CI run, 42631547433).
- A product claim in a module or message is checked in every state a person can be in, the hold
  phase included. #61 said the fall page shows "the next buy day", which it leaves out when no buy
  is ahead.
- A counsel read of a fix round is handed every changed copy file, `docs/LEGAL.md` included: on #69,
  counsel's read of the final delta used main's LEGAL and reported a §6 Q4 gap that the branch had already filled.
- A fact a module will quote is first trimmed to what its one cited source holds: #69's first read
  found 14 items in `e.scams` and 2 in `m.emergency-fund` that only the research report held.
- A design note for a save that is checked "no worse than before" names its edits as tests: one that
  keeps the units and the date, one that raises the units, one that moves the date and one that
  changes the coin. #81's move writer spent both its review rounds on two of them (an edit of only the
  note of a move that an earlier sale left short; an edit into another coin, measured against the old
  coin's excess), and its Log step moved to #87.
- A design note that sizes a new form counts its pure steps and its component apart, and plans them
  as two branches, the steps first, when together they pass the PR limit. #87's move form was noted
  at about 300 lines and built at 520 (steps 210, component 283, copy 27). It was split after the
  build, its steps used both review rounds, and the component waited for the next session.
- A copy fix that states what the core does is checked against every branch of the code it
  describes: everything matches, some of it does, nothing does. #87's short-source line said the
  Log counts a move's shortfall from units held elsewhere, while `matchLots` leaves it unmatched
  when only the destination holds other units; #93's fix said `matchLots` takes those units
  "exactly", false where it finds only some. Each claim cost a review round.
- A figure a form shows beside the core's matching reads the entries at the matching order's place
  on its date (purchases, then moves, then sales), never at the end of the date. #93's short-source
  line read a move's source at the end of its date and named a shortfall `matchLots` never takes
  when a sale at the source shared the move's date; `venueUnitsAtMove` now gives both the same
  figure.
- A refusal that names one entry is tested, from its design note on, in four cases before its words
  are written: the write worsens only that entry; the data was already short before the write (an
  import); only the count in total grows, not the one by date; the entry named is the one the write
  itself stores. #97's three review rounds each found one of these after the words existed: the
  first short step named instead of the one the write made worse, a later purchase said to cover an
  earlier move's fee, and a new move named as another move already in the Log.
- A form decides nothing its core save decides. A fix that refuses in the component before the
  core does is replaced by a save through the core, and a choice the form offers is read again
  inside the write, on the entries as stored. The no-source shortcut that fixed the move form's
  silent Save cost its branch two more review rounds (it refused an edit the core accepts and
  skipped the core's draft checks) and left a race for the next session (#98).
- A test of a choice that a save reads again inside the write writes as another tab would, through
  the stored plan (`planStore.write`), not through `services.domain.write`, which also updates this
  tab's snapshot. #100's race fix passed its same-tab test while another tab's write refused the
  Save with no field and no message on screen, and its second round reloads the stored entries
  before the refusal shows.
- A figure a line states about where the Log holds units is read from the source of the figures
  shown beside it (the move form's source cards, `venueUnitsAtMove`), never from the matching's
  takes: under global lots those sit where global sales left them. #108's round 0 found its
  outside-the-destination figure, read from the takes, contradicting the cards. A count that
  summarizes such lines elsewhere follows the same listing rule as the lines: the per-lot file's
  `feeAtDestination` header from #97 still counted a fee the global matching took at the
  destination while the Log held enough outside it, a move no line names, until #110.
- An e2e spec that makes the price history fail routes that failure before `seedPlan`. Seeding loads
  Today, whose red-day foot requests the history within milliseconds of the seed's return and keeps
  it in IndexedDB for 24 hours (`packages/app/src/lib/adapters/history-source.ts`), so a route added
  after the seed can come too late. #118's first CI run lost that race twice in
  `apps/web/e2e/this-fall.spec.ts` (run 43003072139), while `apps/web/e2e/layout-shift.spec.ts`'s 502
  test still routes after its seed.

## Known gaps

- `lighthouse-vercel` sends the bypass as a header to a preview; deployment protection still
  redirects the service worker's script fetch there, so at a preview `errors-in-console` is asserted
  on `/` only (`tools/lighthouse/vercel.ts` strips it from the seeded screens, Today, Portfolio, Log
  and Plan, for every URL but the production origin). Production, measured at
  `https://proofofcalm.com` without the bypass, and the local run (`apps/web/lighthouserc.json` over
  `tools/serve/vercel-local.ts`) assert it on every page.

## Milestone report

In the closing info box and PR, under 400 words: what shipped, by "Done when" item; the gate with
numbers (core coverage, script on Today, Lighthouse scores); deviations and the ADRs written; open
questions for the owner, each with the default taken; the next milestone's first task.
