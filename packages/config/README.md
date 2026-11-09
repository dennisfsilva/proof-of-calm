# @proofofcalm/config

Shared configuration, dev-time only. Biome and ESLint are root files (ADR-0025); Vitest and Playwright
configs live in their packages. See `docs/ENGINEERING.md`.

- `tsconfig.base.json`, `tsconfig.react.json`: the TypeScript bases.
- `dependency-cruiser.cjs`: the dependency rule of `docs/ARCHITECTURE.md`, run by `pnpm lint:deps`.
  Beside the layer rules: `wouter-only-in-navigation` (the router is imported only by
  `packages/app/src/lib/navigation`, ADR-0045 §9), `no-next-anywhere` (nothing under `apps` or
  `packages` imports `next`, ADR-0045 step 6) and `hosts-never-reach-server` (nothing under a
  host's `src/` reaches `server-only`, `@upstash/redis`, `@vercel/functions` or `apps/web`'s server
  folders, directly or through other modules; ADR-0045 §11), `learn-modules-only-in-learn` (only
  `packages/app/src/features/learn` and tests import `virtual:learn-modules`, ADR-0048, Deviations);
  the two test-data rules, `product-reaches-only-product` and `no-test-data-in-product`:
  `docs/ARCHITECTURE.md`, Packages and their boundaries.
- `vite/`: the hosts' Vite factory and its plugins (`@proofofcalm/config/vite`, ADR-0045):
  - `createHostConfig({ host, root, parseModule })`: the Learn modules' plugins ahead of React, React
    with the compiler through Babel (its `include` covers `.mdx`), Tailwind, the five plugins below
    (and, on the web host, the chunk report), `resolve.dedupe: ['react']`, `build.assetsInlineLimit: 0`,
    Rolldown's `output.codeSplitting` from `chunkGroups()`,
    the host's `import.meta.env.VITE_API_BASE` and `VITE_SERVICE_WORKER`, and the document (`app.html` on the
    web, `index.html` in the wrapper). `parseModule` is the host's import from
    `@proofofcalm/content/modules` (ADR-0048, Deviations).
  - `learnPlugins({ dir, parseModule, elements })` (ADR-0048): three plugins, in order. The front-matter
    transform blanks the block between the two `---` lines and keeps every line number; `@mdx-js/rollup`
    in the `pre` phase with the remark plugin `closedBody`, which fails the build, naming the file and
    line, on an `import` or `export`, an `{expression}` (in the text, as an attribute value or as a
    `{...spread}` of an allowed element), an element outside `elements` (none by default; the hosts,
    Storybook and the app's tests pass `MODULE_BODY_ELEMENTS`, ADR-0048, Deviations), or a Markdown
    link, image or link definition (a module holds no link: ADR-0048, Deviations); and the
    virtual module `virtual:learn-modules`, which reads the `.mdx` files of `dir` (the hosts: the Learn folder
    of `packages/content`; `packages/app`'s tests and stories: its fixture folder; a missing folder is
    no modules), parses each with `parseModule` (a failed parse
    or two files with one slug fails the build) and exports `LEARN_MODULES`, the metadata in the slug
    order of `docs/EDUCATION.md` §10 with no body text, and `LEARN_BODIES`, one lazy import per slug, so
    each body is its own chunk and imports only `react/jsx-runtime`.
  - `checkModuleBody(source, path, elements = MODULE_BODY_ELEMENTS)`: the same compiler and `closedBody` on
    one module with its front matter blanked; the build's message, or null. `pnpm validate:content` runs it.
  - `bootScriptPlugin()`: after every other html hook, in the client build only, the one module entry
    becomes the inline boot script `BOOT_SCRIPT` with the entry URL in `data-entry`; its fixed text
    has the fixed hash `BOOT_SCRIPT_HASH` that the CSP carries (`sha256()` computes such a hash). An
    inline script the source document does not hold fails the build (§3).
  - `fontPreloadPlugin({ file })`: the preload link of the text font, its hashed name read from the
    bundle (§7).
  - `precompileMessagesPlugin()`: every imported `messages/**/*.json` compiled with `icu-minify` and
    `use-intl/format-message` aliased to its format-only entry, so the ICU parser leaves the bundle (§8).
  - `clientNeverImportsServer()`: the client build fails in `resolveId` when a server module is
    resolved, naming the importer chain (§11, the first of the three guards).
  - `noChunkCycles()`: both hosts; fails the build on a static import cycle between chunks, naming
    it, since without `strictExecutionOrder` a chunk in one can run before the chunk it reads
    (`docs/ENGINEERING.md` §4).
  - `chunkGroups()` (`packages/config/vite/chunk-groups.ts`): not a plugin; the code-splitting
    options, one group that keeps the modules Today's entry imports statically in its chunk, entering
    another feature's modules only for the names Today imports (`docs/ENGINEERING.md` §4).
  - `chunkReport({ file })`: web host only; writes every chunk's brotli size at quality 3 and its
    share of code outside `node_modules` to `node_modules/.cache/chunk-report.json`, which
    `tools/size/today.ts` reads (`docs/ENGINEERING.md` §4).

Run: `pnpm --filter @proofofcalm/config test` (the guard tests run a real `vite build` on a fixture
under a temporary directory) and `pnpm --filter @proofofcalm/config typecheck`; both run under
`pnpm check` through turbo.
