# Architecture decision records

One file per decision, numbered. Format: context, options, decision, consequences; a "Disagreement"
section when the planning session disagreed with a decision taken before it and followed it anyway.
A superseded decision is replaced by a new ADR that links both ways.

Conventions (ADR-0046):

- An accepted ADR changes only in a dated `## Corrections recorded on <date>` section appended at the
  end; `## Readings` and `## Deviations` sections may be edited in place; nothing above those
  headings is edited. `pnpm lint:docs` compares each ADR with `main` and fails on an edit above them.
- An ADR is a decision, under 150 lines: context, options, decision, consequences. Design, evidence
  and measurements go to a dated file in `docs/research/`, which the ADR points to.

ADR-0001 to ADR-0015 record decisions the owner took before the planning session of 2026-10-16.
ADR-0016 onward record decisions made in that session after research (`docs/research/`).
ADR-0039 onward record decisions the owner took on 2026-10-17 in the growth session.
ADR-0042 onward record decisions the build session took while implementing the specification.

The "Applies to" column names the paths or packages a change must read the ADR for; the rules files
in `.claude/rules/` list them per path.

| # | Title | Status | Applies to |
|---|---|---|---|
| 0001 | Rewrite from scratch in a monorepo; the prototype's logic becomes `packages/core` | Accepted | the repository; `packages/core` |
| 0002 | Web first as an installable PWA; store apps via Capacitor in M3; no React Native | Accepted; amended by 0041 (the store apps may ship before accounts) | `apps/web`, `apps/mobile` |
| 0003 | The usage loop is reminder → one tap → done | Accepted | `packages/app` features: today, onboarding (the reminder step) |
| 0004 | Account by default, local allowed | Accepted | `packages/app` features: onboarding, account (M3); `packages/app/src/lib/store` |
| 0005 | Stack: Next.js App Router, TypeScript strict, Tailwind, shadcn/ui, Supabase EU, Vercel, pnpm, Turborepo | Accepted; the runtime merging in `cn` superseded by 0043; superseded in part by 0045 (router and host: Vite with wouter, plan B; and the Base UI toast) | the repository; `pnpm-workspace.yaml` |
| 0006 | Prices through a server-side cache; historical closes bundled as static data | Accepted | `apps/web/server`, `apps/web/lib`; `packages/data` |
| 0007 | No exchange API connections in v1; CSV import in v1.1 | Accepted; amended by 0039, and by 0041 (CSV import for the launch exchanges in M2) and 0056 (Kraken, then Trade Republic; synthetic fixtures) | `packages/app/src/lib/adapters` (imports); `packages/core` import formats |
| 0008 | EU-first, worldwide-ready; i18n wired from day one | Accepted; amended by 0041 (pt-PT and German at the launch, M2) | `packages/app/src/lib/i18n`, `packages/app/src/messages`; `packages/content` |
| 0009 | Templates, not recommendations | Accepted | `packages/content/templates`; onboarding and Plan copy |
| 0010 | Free core forever; Plus tier later through a merchant of record | Accepted; amended by 0039 | the product's scope; `packages/app` features: account, settings (M5) |
| 0011 | Honesty is a feature | Accepted; its placement list superseded by 0047 | every piece of copy; `docs/LEGAL.md`, `docs/CONTENT-STYLE.md` |
| 0012 | Coin prices in the pay currency by default, USD as the toggle | Accepted | `packages/core` (prices, portfolio); `packages/app` features: settings, today |
| 0013 | No news, no sentiment, no alerts; the Red day page instead | Accepted | the product's scope; `packages/app` features: today, learn |
| 0014 | Country adaptation: profiles, cards, holding rules, tax-year export | Accepted; the currency a country change re-derives superseded in part by 0053 | `packages/content/jurisdictions`; `packages/core` (eligibility, lots, export) |
| 0015 | Content operations: the agent drafts, a human publishes | Accepted | `packages/content`; `.github/workflows` (the content review, M2) |
| 0016 | Functional core, imperative shell | Accepted; the location of the ports and adapters set by 0032 | `packages/core`; `packages/app/src/lib/ports`, `packages/app/src/lib/adapters` |
| 0017 | Exact arithmetic with a decimal type; strings in storage | Accepted | `packages/core` (money, units); `packages/app/src/lib/format` |
| 0018 | One date policy | Accepted; the location of `todayIn` superseded by 0042 | `packages/core` (dates); `packages/app/src/lib/adapters` (clock) |
| 0019 | Persistence: IndexedDB through `idb`, with the plan held in memory | Accepted | `packages/app/src/lib/adapters` (idb store), `packages/app/src/lib/store`; `packages/app/src/features/shell` (the newer-version screen) |
| 0020 | UI state management | Accepted | `packages/app/src/lib/store`; `packages/app` features |
| 0021 | Sync strategy and conflict handling | Accepted; the route handlers superseded by 0045 (functions in `server/`) | `packages/app/src/lib/store` (outbox); `apps/web` server functions (M3) |
| 0022 | Charts | Accepted | `packages/ui` (charts); `packages/core` (chart maths) |
| 0023 | i18n library and country-driven formatting | Accepted; next-intl superseded by `use-intl` (0045) | `packages/app/src/lib/i18n`, `packages/app/src/lib/format` |
| 0024 | Testing stack | Accepted; the Next Storybook framework and the brotli proxy superseded by 0045 | every package's tests; `apps/web/e2e`; `.github/workflows` |
| 0025 | Linting, formatting and the dependency rule | Accepted; the Next.js ESLint and knip plugins superseded by 0045 | `biome.json`, `eslint.config.mjs`, `knip.jsonc`, `packages/config`, `pnpm-workspace.yaml` |
| 0026 | Email provider | Accepted; its reason restated by 0044 (no promise that data stays in the EU) | `packages/app/src/lib/ports` (Mailer); `apps/web` server functions (M3) |
| 0027 | Error monitoring | Accepted; the Next.js SDK superseded by 0045 | `apps/web`; `packages/app/src/lib/errors` |
| 0028 | Analytics | Accepted; counting in route handlers and server actions superseded by 0045 (functions in `server/`) | `apps/web` (server-side counting); `packages/app/src/lib/ports` (Analytics) |
| 0029 | UK visitors | Accepted; the proxy as the mechanism superseded by 0045 | `apps/web` (the UK block, the site pages), `apps/web/e2e` |
| 0030 | Client-side encryption of synced plans: v2, schema ready in v1 | Accepted | `packages/core` schemas; the database schema (M3) |
| 0031 | Jurisdiction content model | Accepted | `packages/content/jurisdictions`, `packages/content/src` |
| 0032 | Repository architecture and the store-wrapper build | Accepted; the Next.js hosts and `proxy.ts` superseded by 0045 | the repository; `packages/app`, `apps/web`, `apps/mobile` |
| 0033 | PWA and offline | Accepted; `@serwist/turbopack`, `app/manifest.ts` and `@serwist/window` superseded by 0045 | `apps/web` (the service worker, the manifest); `packages/app/src/lib/pwa` |
| 0034 | Forms, validation and numeric input | Accepted | `packages/app` features (forms, drafts); `packages/app/src/lib/format`; `packages/ui` inputs |
| 0035 | Authentication: one-time email code and passkeys, no password | Accepted; session handling in `proxy.ts` superseded by 0045 | `packages/app` features: account (M3); `apps/web` server functions (M3) |
| 0036 | Market data providers and licensing | Accepted; Next's Data Cache superseded by 0045; the credit's link superseded by 0050; the four coins of the reference closes and the hand-picked allow-list superseded by 0052 | `apps/web/server` (prices); `packages/data`; `tools` (the data pipeline, M2) |
| 0037 | Scheduled jobs | Accepted | `.github/workflows` (scheduled jobs); `apps/web/server` (the cron route, M3) |
| 0038 | Payments: merchant of record (deferred to M5, constraints recorded) | Accepted; its CSV-import finding settled by 0039 (all CSV import in the free core) | `packages/app` features: account, settings (M5) |
| 0039 | Automation limits: no orders, no exchange keys, no address watching; CSV import in the free core | Accepted; its "same buy day" read by 0056 as the same month's buy | the product's scope; `packages/app/src/lib/adapters` (imports); `apps/web/server` |
| 0040 | The name is Proof of Calm | Accepted | `packages/app/src/lib/brand`; the site pages; `apps/web/lib/pwa` |
| 0041 | Position and launch plan | Accepted | `docs/GROWTH.md`; the site pages |
| 0042 | `todayIn` lives in the shell's Clock adapter | Accepted | `packages/app/src/lib/adapters` (clock); `packages/core` (dates) |
| 0043 | Class names are joined, not merged | Accepted; its plan-B trigger met, decided by 0045 | `packages/ui`; class names in `packages/app` |
| 0044 | No promise that data stays in the EU | Accepted | every piece of copy; `docs/LEGAL.md`; the site pages |
| 0045 | The hosts move to a Vite single-page app with wouter (ADR-0005's plan B) | Accepted | `apps/web`, `apps/mobile`; `packages/app/src/lib/navigation` and `packages/app/src/lib/pwa`; `packages/ui` (the toast); `packages/app/src/features/shell` (the update prompt) |
| 0046 | Development process v2: the crew plugin, path-scoped rules, review tiers, deterministic sensors | Accepted | `.claude/`; `docs/`; `tools/lint`; `.github/`; the pull request and session issue shapes |
| 0047 | Disclosures at decision points | Accepted | `docs/LEGAL.md` §4–§6, `docs/CONTENT-STYLE.md` §8, `docs/BENCHMARK.md`; every disclosure in `packages/content` and the message files |
| 0048 | Learn modules are MDX compiled at build, with flat front matter | Accepted | `packages/content` (the modules, the front matter parser); `packages/config/vite`; `packages/app` features: learn; the site pages |
| 0049 | Today boots on a generated rules file, not the country profile | Accepted | `packages/content` (`rules/`, `scripts/rules.ts`, the loaders); `packages/app/src/lib/services` (`browser.ts`, `use-profile.ts`); `tools/size/today.ts` |
| 0050 | The CoinGecko credit is unlinked, at 14 px or larger | Accepted | `packages/app` features: today (the prices line), portfolio (the source line and credit) |
| 0051 | The repository is public, from fresh history | Accepted; its fixture sentence amended by 0056 (synthetic fixtures) | the repository's settings and history; `docs/OWNER-SETUP.md` §1 and §3 |
| 0052 | The coin catalogue follows a published rule | Accepted | `packages/content` (`coins.json`); `packages/app` features: onboarding, plan, settings (the coin picker); `apps/web/server` (the price route's allow-list); `packages/data`; `docs/research/letters` |
| 0053 | One currency per plan: a change of country asks before it relabels | Accepted | `packages/core` (`actions/plan.ts`); `packages/app` features: settings (the country change) |
| 0054 | A move between venues is one entry of kind `move`; its coin fee is the units sent less the units received | Accepted; "never from `to`" superseded in part by 0055 for the fee | `packages/core` (schema, lots, exports, backup); `packages/app` (storage rows, the Log, the tax-year header); `docs/research` (the move step) |
| 0055 | A move's fee that nothing outside its destination covers comes from the destination | Accepted | `packages/core` (lots, the cover refusal, the per-lot file); `packages/app` (Portfolio's notice, the Log's refusals, the tax-year header) |
| 0056 | Exchange CSV import: Kraken's ledger first, then Trade Republic, on synthetic fixtures | Accepted | `packages/core` (the exchange readers, the import plan, the ids); `packages/app` features: settings (the import); `docs/research/csv-import-exchanges.md` |

Template:

```markdown
# ADR-NNNN: Title

Status: Accepted · Date: YYYY-MM-DD · Deciders: …

## Context
## Options considered
## Decision
## Consequences
## Disagreement (optional)
## Corrections recorded on YYYY-MM-DD (appended after acceptance; never edit above it)
```
