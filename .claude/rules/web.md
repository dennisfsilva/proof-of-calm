---
paths:
  - "**/apps/web/**"
tier: 2
security: true
proof: a dispatch run of the branch's workflow, with the run id
docs:
  - path: docs/SECURITY.md
    sections: §4 (headers and CSP); §8 (secrets) when an env var is touched
  - path: docs/ARCHITECTURE.md
    sections: "The API, the hosts and the store wrapper"
  - path: docs/ADR/0029-uk-visitors.md
  - path: docs/ADR/0032-repository-architecture.md
  - path: docs/ADR/0045-host-vite-spa.md
    sections: §1 to §6 (Vercel configuration, the API function, headers and CSP, the UK block, the service worker, site pages) and §11 (tests and CI against a local server)
---

# apps/web

The web host on Vite (ADR-0045): the app shell `app.html`, the one API function `server/api.ts`
(loaded by `api/index.mjs`), `vercel.json` with the security headers, the hashed CSP, the UK route
and the rewrites, the service worker `src/sw.ts`, the prerendered site pages `src/site`, e2e tests
and the Lighthouse config. No business logic of its own.

Rules and the tool that checks each:

- Headers and CSP are what `docs/SECURITY.md` §4 lists: static, written into `vercel.json` by
  `scripts/vercel-config.ts` from `lib/security`, hashed (the two inline scripts of the shell), no
  third-party origin in `script-src`, no `unsafe-eval`, no `unsafe-inline`. `lib/vercel-config.test.ts`
  fails while the committed file differs from the code; `lib/security/*.test.ts` pin the policy;
  the e2e suite asserts zero CSP violations on every page (`e2e/csp.spec.ts`).
- Every handler in `server/api.ts` validates its input with zod and answers CORS only for the
  allow-listed origins; no handler limits requests itself (`docs/SECURITY.md` §2 owns the WAF rule).
  `pnpm dev` serves the same module through the Vite plugin `scripts/dev-api-plugin.ts`.
- GB requests get the explanatory page and nothing else (ADR-0029; an installed shell opened in the
  UK is the leakage its Reading of 2026-11-05 accepts): the route in `vercel.json`,
  generated from `APP_ROUTES`, answers 451 for every path but those ADR-0029 and
  `docs/SECURITY.md` §4 leave out (the legal pages, `security.txt`, the API, the static files), and
  `e2e/uk-block.spec.ts` has the request tests.
- Secrets only in `apps/web/.env.local` and Vercel, read behind `server-only` in `server/` and
  `lib/server`; the bundle secret scan runs after every build (`node tools/scan/secrets.ts
  apps/web/dist`); `security.txt` is checked by `node tools/security-txt/check.ts`.
- Budgets: `apps/web/lighthouserc.json` holds the thresholds and the script budget on Today, run
  over `tools/serve/vercel-local.ts`; `lighthouse-vercel` measures production's deployment by itself
  and a preview at its branch URL only by dispatch.
- The shell is one page: an app route is an `APP_ROUTES` entry in `packages/app`, rewritten to
  `/app` by `vercel.json`, never a file in the host; a screen that breaks `pnpm build:export` fails
  the PR.
- The e2e suite (`pnpm test:e2e`) runs against the production build served by
  `tools/serve/vercel-local.ts`, or against a deployment with `BASE_URL` and the bypass secret.

Security checklist: the reviewer applies it to this path (secrets, input validation at the boundary,
CSP and headers, auth and tokens, dependencies, CI permissions).

Empirical gate (named in the PR's Proof section): a workflow run of the branch (`gh workflow run
<file> --ref <branch>`), green, with its run id; for a deployment change, the `lighthouse-vercel`
status of the preview, which only a dispatch posts (`CLAUDE.md`, the preview checklist).

Escape hatch: a CSP relaxation is a change to `docs/SECURITY.md` §4 in the same PR, with the reason.

Review: tier 2 (reviewer with the security checklist, then a refuter over every finding).
