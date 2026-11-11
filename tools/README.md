# tools

Repository scripts, tested like code: the commit-subject check (`commits/check.ts`, in CI and
`pnpm gate`), golden-fixture generation from the prototype (`golden/`), the app icons (`icons/`), the
Vercel deployments' Lighthouse configuration and final-URL check (`lighthouse/vercel.ts`; `config` takes
the deployment URL as its third argument, takes the URLs and the seed from `apps/web/lighthouserc.json`,
sets every warn to error, and keeps `errors-in-console` on the four seeded screens at the production
origin `https://proofofcalm.com` only, where no deployment protection is in the way), the styling
lint (`lint/styles.ts`), message merging (`messages/merge.ts`), the secret scan of client bundles
(`scan/secrets.ts`), Today's application code (`size/today.ts`), the `security.txt` check (`security-txt/check.ts`) and the local servers
(`serve/`). Content validation is `packages/content/scripts/validate.ts`; the reference-close data
pipeline (`tools/data/`, ADR-0036) arrives in M2.

`content-review/reminder.ts` is the content review's reminder (`docs/CONTENT-OPS.md` §2): `issue`
opens or comments on the `content-review` issue for the content-review-reminder.yml workflow
(`--dry-run` prints it, `--today YYYY-MM-DD` picks the day), and `session` is the `SessionStart` hook
that shows the owner one line while a review is due.

The rest of `content-review/` guards the review's output (`docs/CONTENT-OPS.md` §3). `check.ts` is the
guard ci.yml's verify job runs from the base commit: an agent/ head or a PR labelled content-review
changes only content data, deletes none of it (but the owner may remove a visual baseline,
`docs/CONTENT-OPS.md` §8) and leaves every changed entry at agent-draft. `body.ts` renders the PR body
from the agent's JSON draft, every text cell defused and every URL checked against
`packages/content/sources.allow.json`; `render-check.ts` proves that through GitHub's renderer in the
`render` job of content-review.yml. `propose.ts` does the review's git work, so the agent has no git
or gh: `node tools/content-review/propose.ts start` refuses a dirty tree or a HEAD other than
origin/main; `node tools/content-review/propose.ts finish` (`--dry`, `--draft <path>`) stages
everything and refuses a path outside content data, a mode, a binary, a deletion, an entry not at
agent-draft or a draft problem, leaving the index as it found it, before any commit. Without `--dry`
it first refuses a HEAD other than the commit the local origin/main names, the check start makes,
before it stages, switches, commits or pushes anything. When nothing is refused it
writes the body to `.content-review/` (gitignored) and, without `--dry`, commits on
agent/content-review-<date>, pushes and opens the PR labelled needs-owner and content-review; it
never merges. The `finish-dry` job runs it on the fixtures: one change accepted, four refused.

`check.ts` (`pnpm check`) runs the gate's fast half with colour off and vitest's dot reporter, prints
one line per step and only a failing step's last 40 lines. `lint/docs.ts` (`pnpm lint:docs`) checks
that the documents name only paths, commands and ADRs that exist, mark planned items, keep each owned
literal in its owner and change accepted ADRs only below their history heading; it fails on a
finding, and `--warn` (or `DOCS_LINT=warn`) prints the findings and exits 0. `lint/size.ts` (`pnpm lint:size`) holds source files
to 400 lines unless the header says why in a `size-lint-allow:` line. `lint/test-count.ts`
(`pnpm testCount`) prints the number of test files and cases for the pre-PR check.

`size/today.ts` (`node tools/size/today.ts [report] [--warn]`, in ci.yml's e2e-build job after the
build) reads the chunk report the web host's build writes into its `node_modules` cache
(`packages/config/vite/chunk-report-plugin.ts`): every chunk's brotli size at Vercel's quality 3
(ADR-0024's deviations) and its share of code outside `node_modules` by Rolldown's rendered length.
It counts the share of the chunks Today loads, the `app.html` entry and its static imports plus a lazy
Today chunk, its messages and the largest generated country rules file (ADR-0045 §8, §9, ADR-0049), prints one line and exits 1 above the budget of
`docs/ENGINEERING.md` §4 unless `--warn`; a missing report, one without the plugin's fields or without
the `app.html` entry exits 2 with one line, also with `--warn`.
The root `turbo.json` lists the report among the build's outputs, so a cache hit restores it with the
`dist` it describes; it stays out of `dist`, which is deployed.

`serve/vercel-local.ts` is the local stand-in for Vercel (ADR-0045 §11 and its deviations): it serves a
static build through its `vercel.json`, runs the API function from its bundle and compresses as Vercel
does; `apps/web/playwright.config.ts` and `apps/web/lighthouserc.json` start it (`--port`, `--dir`,
`--api`, `--env`; it prints `Ready on` when it listens). It emulates only what the repository's
`vercel.json` uses and refuses anything else at start.

Turbo hashes a task over its own package and its dependencies, so a test here that reads another
package's files names them in `turbo.json`'s `test.inputs` with `$TURBO_ROOT$`; otherwise a change to
them alone replays the cached pass. That holds for another package's `turbo.json` too: Turbo hashes it
with that package's own tasks, not globally. `turbo/inputs.test.ts` checks those inputs, and content
validation's (`packages/content/turbo.json`), against Turbo's dry run; since that run reads
`packages/content/turbo.json` and the check lists `apps/web/messages`, both are among `test.inputs`.
