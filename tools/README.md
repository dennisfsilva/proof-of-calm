# tools

Repository scripts, tested like code: the commit-subject check (`commits/check.ts`, in CI and
`pnpm gate`), golden-fixture generation from the prototype (`golden/`), the app icons (`icons/`), the
Vercel deployments' Lighthouse configuration and final-URL check (`lighthouse/vercel.ts`; `config` takes
the deployment URL as its third argument, takes the URLs and the seed from `apps/web/lighthouserc.json`,
sets every warn to error, and keeps `errors-in-console` on the four seeded screens and the public Learn page at the production
origin `https://proofofcalm.com` only, where no deployment protection is in the way), the styling
lint (`lint/styles.ts`), message merging (`messages/merge.ts`), the secret scan of client bundles
(`scan/secrets.ts`), Today's application code (`size/today.ts`), the `security.txt` check (`security-txt/check.ts`) and the local servers
(`serve/`). Content validation is `packages/content/scripts/validate.ts`. The private reference-close
pipeline (`tools/data/`, ADR-0036): its store, pairs, readers, daily job and backfill, `tools/data/README.md`.

`messages/merge.ts` reads every feature's and lib module's `messages/<locale>.json` for the locales
in its `LOCALES` list (`en`, `pt-PT`, `de`) and writes, into `packages/app/src/messages`, one
`<locale>/<namespace>.json` per namespace and locale and the merged `en.json` for English alone. A
translated file is completed from English (`complete`): a missing key takes English's message, and a
key English lacks, or a file in a locale the list does not name, stops the merge (ADR-0045,
Deviations of 2026-11-15). `--check` reports a missing, stale or leftover file and writes nothing.
`messages/country-prose.test.ts`, a test with no script, holds the pt-PT and German content overlays
and site messages to the country forms' articles (the rule: `docs/CONTENT-STYLE.md` §10's places bullet).

`content-review/reminder.ts` is the content review's reminder (`docs/CONTENT-OPS.md` §2): `issue`
opens or comments on the `content-review` issue for the content-review-reminder.yml workflow
(`--dry-run` prints it, `--today YYYY-MM-DD` picks the day), and `session` is the `SessionStart` hook
that shows the owner one line while a review is due.

`content-review/pdf.ts` gives the review's agent a source PDF as text: `node
tools/content-review/pdf.ts <url>` fetches only an https URL whose host, and every redirect hop's
(three at most), is on `packages/content/sources.allow.json`, stops reading past 25 MB or 60 s,
keeps only bytes that start with `%PDF-`, saves them under `.content-review/pdf/` (gitignored) named
by host and hash, runs pdftotext (shipped with Git for Windows) on that file and prints the `.txt`
path with its word count. When the download fails, or pdftotext is missing or finds no text, it prints the filing rule (an
unreachable row with the url and, in expected, what the source should show, plus a note 'PDF not
read: <url>' naming the lines that rest only on it) and exits 1; a URL off the list exits 2. The
review-content skill does not pre-approve it: unless the session's permission mode approves it, each
run asks the owner and shows its URL.

The rest of `content-review/` guards the review's output (`docs/CONTENT-OPS.md` §3). `check.ts` is the
guard ci.yml's verify job runs from the base commit: an agent/ head or a PR labelled content-review
changes only content data, deletes none of it (but the owner may remove a visual baseline,
`docs/CONTENT-OPS.md` §8) and leaves every changed entry at agent-draft (the translations and the
generated rules files carry no reviewer). `body.ts` renders the PR body
from the agent's JSON draft, every text cell defused and every URL checked against
`packages/content/sources.allow.json`; `render-check.ts` proves that through GitHub's renderer in the
`render` job of content-review.yml. `propose.ts` does the review's git work, so the agent has no git
or gh: `node tools/content-review/propose.ts start` fetches, refuses a dirty tree or a HEAD other
than origin/main and names the day's first free review name; on a review branch it prints that
branch's pull requests and what finish would decide, and refuses;
`node tools/content-review/propose.ts finish` (`--dry`, `--draft <path>`) stages
everything and refuses a path outside content data, a mode, a binary, a deletion (a removed chart
row of the cycles file too, counted per coin), an entry not at
agent-draft, a draft problem or a draft row that does not match the staged diff (`rows.ts`), leaving the index as it found it, before any commit. Without `--dry`,
off a review branch, it first refuses a HEAD other than the commit the local origin/main names, the check start makes,
and a failed fetch or gh, before it stages, switches, commits or pushes anything. `resume.ts` holds
the pure half both commands share: where HEAD stands (`HeadAt`) and its refusals, the day's nine
review names (`reviewNames`) and a name's date, gh's pull-request record parsed with forks' pull
requests and their labels, and `decide`, which on a review branch reads that record first and
resumes only a part-way failure (`docs/research/review-resume.md`). When nothing is refused it
writes the body to `.content-review/` (gitignored) and, without `--dry`, commits on the day's first
free name, pushes it with a plain push and opens the PR labelled needs-owner and content-review; it
never merges and never forces a push. The `finish-dry` job runs it on the fixtures: one change
accepted, five refused. `workflow-paths.test.ts` (in `pnpm test`, not in the workflow's jobs) holds
content-review.yml's `paths:` to every repository file the watched scripts import, followed
transitively, so `packages/content/src/percent-gap.ts`, which `body.ts` imports, is watched; it also
refuses a workspace-package import in a watched script (the jobs install none) and a non-glob entry
that does not exist.

`rebuild/check.ts` is the daily rebuild's check (`docs/RELEASE.md`): `node tools/rebuild/check.ts <url>`,
which daily-rebuild.yml runs on `https://proofofcalm.com/en/holding-date` after calling the deploy hook,
fetches the page every 30 s, 40 times, each request stopped after 20 s and sent past every cache, prints
one line per attempt and exits 1 unless the page's build-date meta (`apps/web/src/site/head.ts`, the
site data's `today`) names the UTC day the check started or a later one (a build that renders after midnight
names the next day). `rebuild/workflow.test.ts` holds the workflow's
schedule, its permissions, the secret read only through a step's env, and runs its hook step in bash with
and without the secret.

`check.ts` (`pnpm check`) runs the gate's fast half with colour off and vitest's dot reporter, prints
one line per step and only a failing step's last 40 lines. `lint/docs.ts` (`pnpm lint:docs`) checks
that the documents name only paths, commands and ADRs that exist, mark planned items, keep each owned
literal in its owner and change accepted ADRs only below their history heading; it fails on a
finding, and `--warn` (or `DOCS_LINT=warn`) prints the findings and exits 0. `lint/size.ts` (`pnpm lint:size`) holds source files
to 400 lines unless the header says why in a `size-lint-allow:` line. `lint/test-count.ts`
(`pnpm testCount`) prints the number of test files and cases for the pre-PR check. A test that runs
the real git passes `GIT_FREE_ENV` from `git-env.ts` and an explicit cwd, so a git hook's `GIT_DIR`
or `GIT_INDEX_FILE` cannot aim it at another repository. Its file calls `useGitDecoy()` from
`git-decoy.ts`, which aims those two variables at an empty repository for the file's run, as a hook
would, and fails the file when a git left a ref or an index entry there. It catches a git that
inherits the two variables, not one run without its cwd, which runs inside this repository instead.

`size/today.ts` (`node tools/size/today.ts [report] [--warn]`, in ci.yml's e2e-build job after the
build) reads the chunk report the web host's build writes into its `node_modules` cache
(`packages/config/vite/chunk-report-plugin.ts`): every chunk's brotli size at Vercel's quality 3
(ADR-0024's deviations) and its share of code outside `node_modules` by Rolldown's rendered length.
It counts the share of the chunks Today loads, the `app.html` entry and its static imports plus a lazy
Today chunk, its English messages (no other language's today chunk) and the largest generated country rules file (ADR-0045 §8, §9, ADR-0049), prints one line and exits 1 above the budget of
`docs/ENGINEERING.md` §4 unless `--warn`; a missing report, one without the plugin's fields or without
the `app.html` entry exits 2 with one line, also with `--warn`.
The root `turbo.json` lists the report among the build's outputs, so a cache hit restores it with the
`dist` it describes; it stays out of `dist`, which is deployed.

`serve/vercel-local.ts` is the local stand-in for Vercel (ADR-0045 §11 and its deviations): it serves a
static build through its `vercel.json`, runs the API function from its bundle and compresses as Vercel
does; `apps/web/playwright.config.ts` and `apps/web/lighthouserc.json` start it (`--port`, `--dir`,
`--api`, `--env`, `--tls`; it prints `Ready on` and its origin when it listens). It emulates only what
the repository's `vercel.json` uses and refuses anything else at start. Plain, it speaks http/1.1 and
drops the policy's `upgrade-insecure-requests` (the e2e suite); with `--tls` it speaks HTTP/2, and
HTTP/1.1 by ALPN, over https on a certificate `serve/self-signed.ts` makes at each start (an EC P-256
key, valid a week, kept in memory), and keeps the whole policy. Lighthouse runs that way, because its
simulation gives an http/1.1 origin six connections and an h2 one a single multiplexed connection, as
Vercel serves (the measurements: ADR-0045, Deviations of 2026-11-25). Its Chrome takes `--ignore-certificate-errors`, without which
the service worker does not register, from the local run's own rc layer, `apps/web/lighthouse/local.cjs`
(`lighthouserc.json` plus that flag), never from `lighthouserc.json`: `lighthouse-vercel.yml` reads the
rc from the deployed commit and `lighthouse/vercel.ts` from the workflow's, which may be one that copies
the launch options unchanged. `lighthouse/vercel.ts` still drops every certificate-ignoring option.

Turbo hashes a task over its own package and its dependencies, so a test here that reads another
package's files names them in `turbo.json`'s `test.inputs` with `$TURBO_ROOT$`; otherwise a change to
them alone replays the cached pass. That holds for another package's `turbo.json` too: Turbo hashes it
with that package's own tasks, not globally. `turbo/inputs.test.ts` checks those inputs, and content
validation's (`packages/content/turbo.json`, its `validate` task and its `test` task, which runs the
script on a copy of the same files), against Turbo's dry run; since that run reads
`packages/content/turbo.json` and the check lists `apps/web/messages`, both are among `test.inputs`.
It also probes every root, name and folder of `copyPathScan` (`lint/copy-paths-scan.ts`), the scan
`lint/copy-paths.test.ts` reads, against the globs `turbo.json` declares.
