# apps/mobile

The static host for the Capacitor wrapper (milestone M3): the same product as `apps/web`, built by Vite
from `index.html` through the shared factory in `packages/config/vite` (ADR-0045 §10). It exists from
M0 so CI builds the export on every pull request and catches a screen that needs the web host's
server. Decisions: ADR-0002, ADR-0032, ADR-0045.

What differs from the web host, all set by the factory's host table: the routes live behind the hash
of the one document (`src/main.tsx` mounts the same services and shell under the hash location), the API is
called at the absolute origin (`VITE_API_BASE`), and no service worker is registered
(`VITE_SERVICE_WORKER=off`). No `vercel.json`, no site pages, no public icons: the wrapper brings its own.

- Build: `pnpm build:export` (from the root; output `apps/mobile/dist`, which Capacitor copies in M3).
- The export check (ADR-0045 §10's assertions): `pnpm --filter @proofofcalm/mobile check:export`; its
  unit tests: `pnpm --filter @proofofcalm/mobile test`.
- The smoke test, against `scripts/serve-static.ts` (plain files, no SPA fallback, port 3100):
  `pnpm --filter @proofofcalm/mobile test:e2e`. CI's `export-build` job runs both after the build.
