# Proof of Calm: what this repository adds to the process

The process is the `crew` plugin: sessions run with `/crew:next-checkpoint`, `/crew:progress` shows
where things stand, and the plugin's README owns the roster, the loop, the tier model and the three
verdicts. This file holds only the repository's inputs. Commands and conventions: `CLAUDE.md`.

## Inputs the plugin reads

- Commands and limits: `.claude/crew.json` (check, gate, test, e2e, dead code, docs lint; the
  subject, branch and PR-size limits; the evaluator's two viewport projects; the content roles).
- How translation files count: hand-written translation files count in full against the 300-line
  PR limit; generated files such as `packages/app/src/messages/pt-PT/*.json` and
  `packages/content/rules/pt-PT/*.json` (planned: M2) do not, since the stale checks prove them.
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
- A function that makes untrusted text safe for a renderer (the content review job's pull-request
  body, rendered by GitHub's Markdown) never predicts the renderer's parse. Its output is safe under
  every reading, and from the first round its tests and its review render each hostile case through
  the real renderer (`gh api markdown -f mode=gfm`). Session 18's guard kept the agent's fences and
  code spans as trusted context, and each review round found a reading it had predicted wrongly: a
  fence closed by a list item, a code span split by a table cell, then the source URLs its escaping
  broke. The guard and the job moved to session 18b (#125).
- A skill that an agent runs for the owner is rehearsed once, by an agent following its text in dry
  mode, before the owner's first run. Session 18b's rehearsal of `/review-content` found ten gaps
  that no review of its code had shown: PDF sources its tools cannot read, a promise that off-list
  fetches are refused, bookkeeping fields with no place in the draft, an allowed tool the text
  forbids, and an example draft whose field does not exist (#136). Skills have their own rules file
  above tier 0 since (`.claude/rules/skills.md`), because a skill steers an agent with pre-approved
  tools under the owner's identity, and this one's text merged at tier 0 with no review agent before
  its rehearsal found those ten gaps. Each later rehearsal found new edge cases in the wording (ten
  in #141's, nine in #144's, eight in #150's (#152), none of them in the security model), so a rehearsal proves the wiring and the
  security model, and the owner's first real run is the gate for the remaining wording.
- When review rounds keep finding one more state of the same mechanism, stop and run an unanchored
  design check before the next round. Six review rounds of the content review's resume each found
  one more state; two blind designers found the root cause in #144: every review of a day shared
  one branch name, so finish guessed which pull request belonged to which review. Since #151
  (2026-11-12), each review takes its own name.
- A test harness that copies an executable on Windows pays the antivirus scan of the copy on its
  first run. #147's fake gh, a copy of node.exe, took 27.6 s of a 30 s timeout cold in a fresh
  worktree and 1.7 to 7.9 s warm, while Linux CI never saw it: keep such a test's first run well
  under its timeout and run it once cold before reporting. #151 keeps one copy per node version in
  the temp folder and warms it in `beforeAll`, since a link to node.exe in Program Files fails with
  EPERM: 6.7 s cold and 6.1 s warm.
- A property test's local time is not CI's. CI runs the core's tests with coverage on a smaller
  runner, and fast-check draws a new seed each run. #178's import-plan properties took 3.6 s
  locally at 2,000 runs, passed on the pull request, then timed out at 20 s on main, at least 5.6
  times slower (#181). A brief asks for the worst time over several seeds under the full suite with
  coverage. It sets the run count and the timeout so that six times that worst stays under a third
  of the timeout. The core's default timeout is Vitest's 5 s.
- A guard that limits what an agent's branch may change is checked against every required check that
  branch must pass. Session 18b's content review guard refused the baseline deletion that the
  required e2e-visual check needs after any change to text a screen shows; the integration read found
  it after the guard had merged (#137).
- A check that tells whether a change already landed on main reads the content or the record of the
  merge, never the patch. In #136, `git cherry` called a rebase-merged review unmerged whenever main
  had changed a line within 3 lines of the review's edit before the merge, because a patch-id
  includes its context lines. That was the fourth review round of the branch
  fix/review-finish-resume. #151 (2026-11-12) replaced that branch: finish now reads the PR's record
  first (`decide` in `tools/content-review/resume.ts`).
- A fix for a wiring bug is proven by a test that goes through the wiring: reverting the fixed line
  must fail a test. In #136, the rows branch's fix for a Learn module's review dates was tested only
  on the pure function it calls. Reverting the wiring line (the module branch of `changedLeaves` in
  `tools/content-review/propose.ts`) left all 57
  content-review tests green; a `finish --dry` test in `tools/content-review/propose.test.ts` now
  fails on that revert.
- A rule added to a skill's allowed-tools is the owner's own line: the auto-mode classifier refuses
  an agent's edit that widens what an agent may run without asking (Self-Modification). Session
  18e's `Bash(node tools/content-review/pdf.ts *)` was refused, so pdf.ts asks the owner on each
  run. Design a skill to work without a new pre-approval, and list any rule still wanted for the
  owner.
- A design check's reports go into the session issue or a dated research note on the day they are
  written. Session 18f's two blind designers' tables lived only in that session's transcripts, and
  18g recovered them from there for `docs/research/review-resume.md` (#150).
- A judge of a design check audits every stated reason at the line it cites, the planner's and the
  designers' alike. The Taxes module's check (#24, 2026-11-12) found 19 reasons false or partly
  false (`docs/research/tax-result-question.md` §8), among them the joiner mechanism the plan rested
  on, which no review of a branch would have reached before the code existed.
- A content-role path list is derived from every file that writes the copy, its fixtures and
  expected files included, never from where the copy is first seen. The two globs proposed for the
  tax-year export missed its fixtures, the core's expected files and its component, so its own
  review took them out again for a branch of their own (#24, 2026-11-13).
- A test that scans tracked files by a name pattern gets turbo inputs that hash its whole scan,
  derived from the same list. The export-copy-paths branch's test scanned every
  `tax-year` path outside `apps/web/e2e/` and `docs/`, while `tools/turbo.json` hashed only such
  paths under `packages/`. Each review round found one more place where a local run would replay a
  cached pass: the app fixtures folder in round 1, `apps/` in round 2. The branch waits with that
  finding (#159, 2026-11-13). It merged once the scan read only `packages/` from one list
  (`tools/lint/copy-paths-scan.ts`) that `tools/turbo/inputs.test.ts` probes (#166, 2026-11-13).
- A doc line that cites the pull request that builds it takes that PR's number at PR time: the next
  number from `gh api "repos/<owner>/<repo>/issues?state=all&per_page=1"`, checked after `gh pr
  create`. It never takes the session issue's number. #161's second review round found a ROADMAP
  line that cited #159 (2026-11-13).
- A design check of a matching walks each person through two imports as well as one: a shorter
  export first, then the whole file. The exchange import's check (#15) walked twelve people through
  one import each and settled the order of the plan's steps; the plan's first review round then
  found a hand-recorded purchase imported again, and its second a purchase dated before a `held`
  entry stored without the person's answer when the file came in two parts. The branch waits for
  an unanchored check of the order (#175, 2026-11-13).
- A design note that sizes a screen counts its sections, its alerts and its refusals apart from its
  copy, and a split it plans keeps each part true on main by itself. The exchange import's Settings
  branch was noted at about 245 lines and built at about 700, and it was split in three after the
  build. Its alerts could not merge alone. Until the preview rendered, they named a format the app
  could not yet import, a false statement about the software (LEGAL §3.9). So they shipped with the
  container, at 362 lines (#184, #185, 2026-11-13).
- A builder counts each commit subject before committing (`printf '%s' "<subject>" | wc -c`, where
  `§` counts as two bytes and `pnpm lint:commits` counts it as one character). Four builders of
  the exchange import pushed a 101-character subject. Each pushed branch then needed a re-cut by
  cherry-pick and a lease push that only the session may run (#183, #185, 2026-11-13).
- A screen that shows a choice the write reads again is also tested through the path by which
  another tab's write reaches this tab. `planStore.write` alone, as the lesson on a choice read
  again inside the write asks, leaves this tab's snapshot as it was. So the exchange import's tests passed, while a real second tab
  refreshed the preview silently and Import wrote it without the changed alert. The evaluator's
  two-tab run found it. The fix's tests drive a real `crossTabChannel` between two services over
  one `memoryPlanStore` (#188, 2026-11-13).
- A fixture whose counts a test pins is never extended for another branch's case; the new case
  gets its own synthetic file. The Kraken fold added five rows to the shared synthetic ledger, and
  the e2e spec's pinned "47 rows" and "7 entries" failed on every project until the rows moved to
  their own files (#189, 2026-11-13).
- A design note that puts a provider's name into the product's copy lists LEGAL §6 Q4's carve-out
  and the ADR that rules the naming among the files it changes. Counsel's first read of the Trade
  Republic screen marked every line that named Trade Republic a perimeter breach, because the
  carve-out named Kraken alone (#193, 2026-11-14).
- A change to what the core plans runs every story file of the feature it reaches, not only the
  stories the branch changed. The month rule's builders ran their own stories, and the exchange
  import's "Log Changed" story failed in all four story projects: under the new rule another coin's
  one-tap estimate no longer changed what the file adds, so the story's premise had moved
  (#196, 2026-11-14).
- A branch that widens a property's generator runs the whole affected property suite over seeds 1
  to 8 before review, and attributes a failure to main or to the branch before fixing it. The guards
  branch's early dates found, at one seed, a non-convergence in #196's step-2 fallback: a typed
  monthly buy fell back to its 3 days whenever its walk claimed nothing. Its fix then took the
  branch's second fix round (#197, 2026-11-14).
- A line that tells a person what to change in the Log, then to choose the file again, is proven by
  a test that makes the change to the stored entries and plans the file again, in every state the
  line can show: before the import, after the person imports first, and after a shorter export stored
  the purchase. Reasoning about the state missed each failure in session 22c (#197, 2026-11-14). The
  starting-amount line said to record a purchase the Log already counted. The still-late line named a
  month Record does not open. After the estimate line's date change, another hand entry took the
  purchase. #200's design check settled them on 2026-11-14: the starting-amount line names the
  purchases and asks for no change (#204); its instructions and the estimate line follow behind the
  plan-again check (#205); `replacesHint` was cut (#203); and the still-late line was cut. The same
  check then reasoned that importing first changes no claim of the delete sentence, and #203's first
  review round found it false: imported entries join a hand row by `transactionKey`, which holds no
  coin, and an imported sale changes which deletes the Log refuses. A design check's reason that
  drops one of these states is tested like the line itself.
- A fix that moves a rule into one shared function keeps each caller's guards, with a test for each.
  The first part of #205's starting-line instructions moved what an edit keeps from the Log's
  `keepUnchanged` into one core function, so the import's check would store an edit as the Log does.
  `keepUnchanged` gives a new transaction back as saved before its rule runs. The check's record path
  called the shared rule without that guard, and the second review round found a recorded fee
  dropped (2026-11-14).
- A cost bound is measured on the worst state the code allows at the bound, every capped list at
  its cap, and each figure names its state and its movement count in DOMAIN §9, which the test's
  comment points to. The estimate line's builder measured a state where no capped list was full,
  267 to 278 ms at 520 movements. Its review built 12 estimate rows over 12 sentence rows at the
  same 520 movements and measured 892 to 902 ms against §9's 600, which moved the bound to 400. The
  next round found the comment crediting 520 and 440 movements to a state that holds 432 (#210,
  2026-11-14).
- A rule about an entry the person taps is walked through every day the app offers the tap, and an
  instruction to type figures through every way the person can type them. Rule R was checked for a
  starting amount tapped on its purchase's day; the integration read found it tapped on a later buy
  day, where Today keeps offering it, claiming that day's monthly purchase. The starting line's
  change was checked with the date's summed figures, while the line lists each fill, so typing one
  fill's figures leaves the others out (#210, 2026-11-14).
- A rule that compares a date's summed amount with two targets is walked with the date cut on each
  side and with the targets in each order, and a property's precondition skips exactly the
  exception the documents state, each case pinned by a unit test. A lump's claim by its amount was
  decided with the cost of an export that ends inside the lump's date. The first review found one
  that begins inside it. The second found a starting amount below the monthly part, where part of a
  date passes the test the whole date fails, so a cut moves the claim to another date (#216,
  2026-11-14).
- A condition a document states for when two imports differ from one is derived by a property that
  runs both over the generator, not by walks. Three review rounds each found one more state of an
  export cut near a lump's date; the condition the next fix round was given, derived by hand, the
  property then refuted: a cut also moves another hand entry's claim and can leave out a purchase
  one import stores (#218, 2026-11-14).
- A design note's words for an order are checked against the implementation its design check
  measured, before the build. Rule G's note said a lump claims after the hand monthly buys, while the
  audit's scratch switch, which gave the note its figures, ordered a lump by date with the monthly
  buys that fall back to their 3 days. The fourth review round found a lump of 1 Sep claiming before
  an August buy of 400 typed 2 Sep: 1,600 against the rule's 1,700 (#223, 2026-11-15).
- A gate a design check sets on an amount is walked and measured at each boundary value, below, at
  and above it, before the build. Rule G's ratio gate, chosen by #221's design check and built in
  #223, was walked with a lump above and below its coin's monthly part. At the part it passed on
  every date, and the lump's walk began at a date an earlier import stored, stopped there, and left
  a date to a shorter export that the whole file's lump records. #223's runs and main's next two
  push runs passed; a docs-only pull request's run found it at a random seed (43674251573), and #227
  reworked it (2026-11-15).
- An oracle that recomputes a document's condition keys each claim by the role the condition
  names, and the condition names it. W2 said "the dates hand entries … claim", and #223's cut
  property keyed a claim by coin and date, so a hand sale's claim on a date with a purchase counted
  that purchase as doubled. The property held at 25 seeds, and main's push run after #227 failed at
  a random one, one world in 30,000. The code was right: #228 keyed the oracle by role, and W2 now
  says purchase dates (2026-11-15).
- A branch that changes `apps/web/scripts/build.ts`, `apps/web/src/sw.ts` or `packages/config/vite`
  runs `apps/web/e2e/pwa.spec.ts` and `apps/web/e2e/offline.spec.ts` on the desktop project before
  it hands back, since a development build or a worker that does not install fails only there.
  #234's first CI run failed there: Vite's `runnerImport` had set `NODE_ENV` to `development` for
  the client build (2026-11-15).
- A link to a feature, or a document sentence that describes it, lands in the branch that makes the
  feature live, never in an earlier branch of the same plan: each merged part is true on main by
  itself. #230's steps branch added the country pages' link "Show the date a purchase passes this
  holding rule" and LEGAL §4's and JURISDICTIONS §1's sentences on the tool's lines while the page
  had no tool (the island was the next branch); its second review round found the link promising a
  date the page does not give, and the branch waited for the next session (2026-11-15).

- A worker that keeps a value out of its cache keys also deletes the keys an earlier worker wrote.
  The earlier worker keeps control until the update is accepted or every tab it controls closes (the
  site pages never post SKIP_WAITING), and WebKit keeps a cache entry's first request URL on a later
  put of the same page. #245 kept the holding-date tool's fragment out of the `pages` keys; the
  integration read found a browser that the previous worker still controlled keeping the purchase
  date in a key after the update, and #247 deletes such keys when the worker activates (2026-11-15).
- A page with an empty native date field takes its WebKit baselines with the field masked: WebKit
  draws the day of the run into an empty `input type=date`, so the image fails the next day. The
  holding-date page's iphone pair was left out of #246 for this and moved to session 24
  (2026-11-15).
- A scroll container on a prerendered page, which runs no client script, is always a focusable
  region named by its caption (`tabIndex` 0, `role="region"`, `aria-labelledby`): the UI kit's
  `Table` makes its wrapper focusable only after an effect measures the overflow, and that effect
  never runs there (`docs/DESIGN.md` §8). #250's falls table passed every project but zoom-125, where
  axe's scrollable-region-focusable failed in CI (2026-11-15).
- Counsel's wording goes through the banned-words lint (`pnpm validate:content`) before it reaches a
  builder's brief, and the session decides each refusal in the same brief: an allow-list entry with
  counsel's reason, or a fallback counsel rules on. On #250, "private key" and "deposit-guarantee"
  hit the ban list after counsel's first read, the builder fell back, and counsel's second read
  restored "private key" with an allow-list entry: one more fix round (2026-11-15).
- A design note that adds an e2e test names the projects its spec file runs on.
  `apps/web/playwright.config.ts` lists `site.spec.ts` in `requestOnly`, so it runs on the desktop
  project only, and #254's layout tests for zoom-125 and android-small would never have run there;
  its builder moved them to their own `apps/web/e2e/risk.spec.ts` (2026-11-15).
- A privacy notice's claim about what a request carries covers the transport as well as the
  payload. Counsel's first read of #255 found "These requests carry no plan, no entries, and no
  identifier" false twice: the history request names a coin of the plan, and the host receives each
  request's internet address. The notice now says the requests name at most a coin and a currency
  and carry no identifier that Proof of Calm sets (2026-11-15).
- A question left for the owner quotes both sides of the research it rests on. #255's first LEGAL §9
  question gave only research §4.4's "a free app arguably has no consumer transaction", and left out
  its course of publishing the RAL list and the complaints-book link from launch, with the footer
  link that brings; counsel's second read added both (2026-11-15).
- A ban-list rule for a language whose imperative is spelled like its subjunctive cannot be made
  exact by exceptions. Each pass a fix added for a needed sentence opened a hole the next review
  found (the subjunctive after "que", a word cap on a leading infinitive, "venda" before a figure),
  and two sentences it passed were refused by main. Such a rule refuses too much from the start, the
  needed sentences are reworded or allow-listed, and every pass a fix adds is checked against the
  sentences the previous head refused; the Portuguese ban list waits for its design check (#19,
  2026-11-15).
- A branch that adds a dynamic import emits chunks into both hosts' builds and into the worker's
  precache (`assets/**/*.{js,css,woff2}`), so it measures the precache and Today's bytes itself and
  keeps a hidden language's chunks out of the precache (`assets/messages/<locale>/`, #258). The
  content loaders in a language were split off #259 for this reason (2026-11-15).
- A size tool's file pattern is checked against every file the change adds that the pattern could
  match: `tools/size/today.ts` counted pt-PT's today chunk (1,444 bytes) as Today's until #258's fix
  round (2026-11-15).
- A fallback is tested through every value the boot derives from the decision, not only the one it
  resets. #258's first boot reset `html[lang]` and the registry but kept the provider and the
  services in pt-PT, so English text showed Portuguese dates; brand found it from the code, and a
  unit test and an e2e case that aborts the language's chunks now hold it (2026-11-15).
- A language added to the formats is evaluated on the narrow projects before any translation.
  pt-PT's dates pushed Log's entries table 2 px past the viewport at zoom-125 and cut the € off every
  amount, which `apps/web/e2e/language.spec.ts` (desktop and iphone only) could not see; the
  evaluator found it after #258 merged (2026-11-15).
- A layout that switches on a measured width and stores the width it measured goes stale with every
  input that width depends on. The pt-PT tables' fix stored the columns' width; its first review
  found that shorter rows never turned the table back, and its second that text which shrinks after
  the switch (a text-size change, a web font narrower than its fallback) leaves it stacked. Such a
  mechanism gets a design check before its second round; the branch waits for it in #268
  (2026-11-16).
- A fix to a fallback that the test services also take turns every test that relied on the fallback
  red. The test services load no rules for the Portuguese fixture plan, so #263's country-locale
  fallback changed 84 app tests' expected formats; a brief names that sweep when a fix changes what
  the test services default to (2026-11-15).
- A brief's expected format is checked against the ADR that owns the format before it reaches a
  builder. The brief for #264 asked for US-ordered template dates, while ADR-0023 decides that dates
  in copy follow the UI language; the builder's test built an en-US formatter by hand and passed, and
  only the evaluator showed the screen's `1 Jun 2028` (#267, 2026-11-16).
- A text a lint cuts into sentences is checked against every token the text can hold. #265 split
  sentences at a dot followed by a letter, and #264's placeholders hold dotted paths
  (`{date:sellWindow.opens}`), so an imperative before a placeholder and the asset after it fell
  into different sentences; the integration read found it, and the lint now reads a placeholder as
  one word (2026-11-16).
- An action a fallback offers is walked through the same failure. #262's offline toast offered
  Edit, whose sheet loads the namespace that had just failed; pressing it replaced Today with a load
  error, which only the evaluator's offline run showed (#266, 2026-11-16).
- ci.yml's push-to-main Lighthouse reads the keyless CoinGecko API through `/api/prices`, and its 503
  fails `errors-in-console` on Today: twice on 2026-11-15, then on both attempts of run 43777047831
  on 2026-11-16, with the next push passing. A rerun is not a fix, and a red main stops the
  unattended chain; the Lighthouse runs route the price API to fixtures in #268.

## Known gaps

- `lighthouse-vercel` sends the bypass as a header to a preview; deployment protection still
  redirects the service worker's script fetch there, so at a preview `errors-in-console` is asserted
  on `/` only (`tools/lighthouse/vercel.ts` strips it from the seeded screens, Today, Portfolio, Log
  and Plan, and the public Learn page, for every URL but the production origin). Production, measured at
  `https://proofofcalm.com` without the bypass, and the local run (`apps/web/lighthouserc.json` over
  `tools/serve/vercel-local.ts`) assert it on every page.

## Milestone report

In the closing info box and PR, under 400 words: what shipped, by "Done when" item; the gate with
numbers (core coverage, script on Today, Lighthouse scores); deviations and the ADRs written; open
questions for the owner, each with the default taken; the next milestone's first task.
