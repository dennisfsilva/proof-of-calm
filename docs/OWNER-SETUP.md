# Owner setup

Steps that need the owner's accounts or decisions. The build session prepares everything in the
repository and lists here what only the owner can do. Each item says why it matters and what the
default is until it is done. Checked on 2026-10-17.

## 1. GitHub: branch protection and Actions minutes

Done on 2026-10-17: the repository stayed private, on GitHub Pro (monthly), until the visibility
question came back (`docs/LEGAL.md` §9, `docs/RELEASE.md`). On GitHub Free, GitHub refused rulesets on
a private repository (HTTP 403: "Upgrade to GitHub Pro or make this repository public"); Pro allows
them. Since 2026-11-08 the repository is public, from fresh history (ADR-0051): the ruleset `main`
was created again there with the same rules, it no longer needs Pro, and CodeQL and GitHub's secret
scanning can be turned on. The history before that day is in the private
dennisfsilva/proof-of-calm-archive.

- **Minutes.** Free on the standard runners since 2026-11-08 (ADR-0051); what follows is the
  private repository's. Pro includes 3,000 Actions minutes a month; extra minutes cost $0.006 each on the
  standard Linux runner, capped by an Actions budget (Settings → Billing & Licensing → Budgets and
  alerts). On 2026-10-17, the day M0 was built, 60 CI runs took about 650 minutes (about 11 each).
  From 2026-10-01 to 2026-10-26 all workflows took about 10,900, about 7,900 over the included
  minutes; pushes to `main` that re-ran `stories`, `export-build` and `e2e-visual` on a tree their
  pull request had passed took about 1,400 of them, and dispatches of `ci.yml`, which ran the whole
  gate to get its Lighthouse job, about 2,100; #194 stops both. Which runs skip jobs: the header of
  `.github/workflows/ci.yml`. From 2026-10-27 to 2026-11-05 `lighthouse-vercel.yml` took about 2,840
  minutes, about 2,170 of them on 309 previews of 114 pull requests; since ADR-0024's deviation of
  2026-11-05 it measures production by itself and a preview only by dispatch.
- **The ruleset `main`** (Settings → Rules → Rulesets), created on 2026-10-17 and again in the public
  repository on 2026-11-08: pull requests only,
  merged by rebase, no approval required; required checks `verify`, `stories`, `export-build` and
  `e2e-visual`, with `lighthouse` and `lighthouse-vercel` too until 2026-11-05 (below); force pushes
  and deletion blocked; no bypass,
  for anyone. No code-owner review: the build session commits under the owner's account, and GitHub
  never counts an author's review of their own pull request. Content keeps its human gate in CI,
  which blocks `reviewedBy: agent-draft` on `main` (`docs/CONTENT-OPS.md`). On a pull request the
  OSV scan runs only when dependencies or its workflow change, so it is not required; it also runs on
  every push to `main`, weekly and by hand.
- **Done on 2026-11-05: `lighthouse` and `lighthouse-vercel` left the required checks.** Since
  ADR-0046 the local-build Lighthouse job runs only on pushes to `main` and, by hand, on a branch
  (`lighthouse-branch.yml`, which posts the same `lighthouse` check); a pull request skips it. Since
  ADR-0024's deviation of 2026-11-05, `lighthouse-vercel` reports by itself only on `main`'s head,
  and on a pull request only after a dispatch.

## 2. Renovate

Install the Mend Renovate GitHub app on this repository (free) once its pull requests can pass the
ruleset `main`. Until 2026-11-05 they could not: `lighthouse-vercel` was required (§1) and never
reported on them, since their group branches, `renovate/weekly-minor-and-patch-updates` (39
characters) and `renovate/playwright-and-its-container` (37), exceed the branch-name limit
`CLAUDE.md` sets for Vercel's branch URL, and on Hobby, Vercel builds no commit whose author is
`renovate[bot]` (§3). Neither blocks the ruleset now; their previews stay unmeasured, since no
dispatch can reach them. `renovate.json` sets weekly grouped minor and patch
updates on Monday mornings, three-day release age, majors separate, the Playwright package and its
pinned container together and never automerged. Keep Dependabot **security alerts** on (Settings →
Code security); Dependabot version updates stay off (ADR-0025).

Socket (ADR-0025): install the free Socket GitHub app on this repository, so that pull requests that
change dependencies get its supply-chain check. Not installed as of 2026-10-18; until then
OSV-Scanner (`.github/workflows/osv-scanner.yml`) is the only dependency scanner in CI.

## 3. Vercel

Done on 2026-10-17: the project `proof-of-calm` (team Incubator, Hobby) builds from the root
directory `apps/web`; with ADR-0045 the preset is Vite with the default install command,
`pnpm build` as the build command and `dist` as the output directory (`apps/web/vercel.json` is
read from the root directory; its `framework`, `buildCommand` and `outputDirectory` override the
dashboard's Framework Preset, Build Command and Output Directory
([Vercel's vercel.json reference](https://vercel.com/docs/project-configuration/vercel-json),
read 2026-10-30), so the project settings need no change);
`main` goes to production and every other branch to a preview. Hobby is fine before launch; Pro is
required from launch because Hobby forbids commercial use (ADR-0005).

- **Open since 2026-11-08, the owner's: connect the project to the public repository** (Project →
  Settings → Git: disconnect dennisfsilva/proof-of-calm-archive, connect dennisfsilva/proof-of-calm,
  and let Vercel's GitHub app see it if asked). Until then production serves the last deployment of
  the archive's `main`, and a merge deploys nothing (ADR-0051).

- Environment variables, Production and Preview: `COINGECKO_API_KEY` (the Demo key, type Secret).
  `ENABLE_EXPERIMENTAL_COREPACK=1` (type Config) was set from the project's creation and removed by
  the owner on 2026-10-20 (one dashboard action, Production and Preview), as decided that day. It
  added nothing: with Corepack disabled, every build log since 2026-10-17 reads "Detected
  pnpm-lock.yaml version 9 … from package.json#packageManager pnpm@12.14.0" and installs with pnpm
  12.14.0, so the `packageManager` field of `package.json` already selects pnpm; after the removal,
  the owner's redeploy of main's 93c6f81 without cache on 2026-10-20 logged the same line with no
  corepack line before it (the tracker, #33). Vercel's documentation (Configuring a Build, the
  Corepack section, last updated 2026-08-28) calls Corepack experimental and says any Node.js
  release may remove it. While the variable was set, each build warned four times "Disabling
  corepack because it may break your project" because Vercel's version check cannot read Turborepo's
  version given as `catalog:` (2.11.8); adding `COREPACK_HOME` to `globalPassThroughEnv` in
  `turbo.json` would have silenced it by turning the experimental tool on, for no gain, so that was
  not done.
- Not set yet: `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` for the shared "last good"
  price store (Upstash Redis in `eu-central-1`); until then each function instance keeps its own
  copy. Add them before launch, and check the names if a marketplace integration creates them.
  `.env.example` lists the full shape.
- Functions run in `fra1` (ADR-0005), pinned in `apps/web/vercel.json`; Hobby allows one region.
- Deployment Protection keeps Vercel Authentication (Standard Protection) on, so a preview needs a
  login. Its "Protection Bypass for Automation" secret, created on 2026-10-17, belongs in the
  repository's Actions secrets as `VERCEL_AUTOMATION_BYPASS_SECRET` (open since 2026-11-08, the
  owner's: add it to the public repository, which started without it; only the dispatched preview
  checks use it); `lighthouse-vercel.yml` sends it
  only to `proof-of-calm-…-incubating.vercel.app` hosts, so a renamed project or team slug needs that
  check changed too (ADR-0024). The job starts from Vercel's own commit status and measures each
  deployment at its branch URL. The same file's `preview-checks` job sends the same secret to the
  same hosts, on a dispatch with `checks=true` only and never to the production deployment, to run
  the request-level specs and `apps/web/e2e/deployment.spec.ts` against a preview (commit status
  `preview-checks`; the command is in `CLAUDE.md`).
- Vercel builds a commit only when GitHub links its author to the owner of the Hobby team: the
  commit email (`git config user.email`) must be a verified address of the owner's GitHub account.
  Otherwise every deployment reports "Deployment was blocked" while CI stays green; the address in
  use was added on 2026-10-17.

## 4. The domain: proofofcalm.com

Done on 2026-10-17 at Spaceship, which serves the domain's DNS (`launch1` and
`launch2.spaceship.net`): the apex serves the production deployment over HTTPS and `www` redirects
to it with a 308 (`docs/RELEASE.md`). Until launch the app serves a `noindex` holding page at `/` and
sends `X-Robots-Tag: noindex, nofollow` everywhere.

| Type | Name | Value |
|---|---|---|
| A | `@` | `216.198.79.1` |
| CNAME | `www` | `c36305cf4709c593.vercel-dns-017.com`, the project's own target in Vercel's Domains settings |
| TXT | `@` | `v=spf1 -all` |
| TXT | `_dmarc` | `v=DMARC1; p=reject; adkim=s; aspf=s` |

`proofofcalm.app`, also at Spaceship, redirects permanently to `proofofcalm.com` (`docs/GROWTH.md`
§2.6): it and `www.proofofcalm.app` are domains of the same Vercel project that answer with a 308
keeping the path and the query, and they carry the same four records as the table above. Browsers
reach `.app` addresses over HTTPS only (the ending is on the HSTS preload list), which the parking
page Spaceship served before did not offer; Vercel issues the certificates. Spaceship's form refuses
a null MX (`MX 0 .`), so the domain has no MX record and mail sent to it is not delivered.

- The mail records went in at M0 so the domain ages before the first email in M3 (`docs/ROADMAP.md`
  M0). The apex sends no mail, so it says so; the sending subdomain `mail.proofofcalm.com` gets its
  own SPF, DKIM and a `p=none` DMARC record from the mail provider at launch, before M3 (ADR-0026,
  `docs/RELEASE.md`). Add `rua=mailto:<address>` to the DMARC record once a mailbox exists for
  aggregate reports.
- `security@proofofcalm.com` is already published: it is the `Contact` of the live `security.txt`,
  and the contact page promises an acknowledgement within 72 hours. Until it has a mailbox, which
  needs an MX record (above), reports sent to it are not delivered.
- Before launch: a CAA record for the certificate authority Vercel uses (Let's Encrypt issued the
  certificate of 2026-10-17), and `security@`, `privacy@` and a contact address that are read
  (`docs/LEGAL.md` §5, `docs/RELEASE.md`).

## 5. Keys and accounts

- CoinGecko: done on 2026-10-17; the Demo key (free, attribution required, ADR-0036) is in Vercel,
  and for local work in `apps/web/.env.local`.
- Optional: Turborepo remote cache (`TURBO_TOKEN`, `TURBO_TEAM` as repository secrets) to shorten CI.
  `ci.yml` does not pass them to its steps yet, so the secrets alone change nothing.

## 6. Still open from the planning sessions

- The TMview search and the EUTM filing in classes 9, 36, 41 and 42 (`docs/LEGAL.md` §1).
- The letters to Kraken and Bitstamp before M2 (ADR-0036): drafted as
  `docs/research/letters/kraken.md` and `docs/research/letters/bitstamp.md`; fill in the name and
  the contact address, send, and record the answers in ADR-0036.
- The email provider's final pick at M3 (ADR-0026); the `Mailer` port makes it a one-file change.
