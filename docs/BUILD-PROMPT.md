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
