# apps/web

The Proof of Calm application on Vite (ADR-0045): the app document (`app.html`) and its entry
(`src/main.tsx`: the services over the browser's adapters, `packages/app`'s shell under the browser
location, the service-worker registration handed to the shell), the
prerendered site pages (`src/site`), the one API function (`server/api.ts`, loaded by `api/index.mjs`),
the service worker (`src/sw.ts`, the kill switch `public/serwist/sw.js`) and `vercel.json`, written by
`scripts/vercel-config.ts` with the headers, the hashed CSP, the UK route and the rewrites. `pnpm build`
runs `scripts/build.ts`; `node ../../tools/serve/vercel-local.ts` serves the result as Vercel would
for the e2e suite and Lighthouse. Created in milestone M0 (see `docs/ROADMAP.md`). Boundaries and
folder layout: `docs/ARCHITECTURE.md`.
