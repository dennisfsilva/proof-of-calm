# ADR-0048: Learn modules are MDX compiled at build, with flat front matter

Status: Accepted · Date: 2026-10-30 · Deciders: the build session, on the owner's delegation

## Context

M2 ships the seven Learn modules (`docs/ROADMAP.md` M2, `docs/EDUCATION.md`). Each is one idea under
400 words with front matter the content test validates (`docs/EDUCATION.md` §10), one caveat, at most
one chart, a reading time and a "last reviewed" date. A module opens in three places: the sheet behind
a "Why?" link, Learn's own route in the app, and a public, indexable site page (`docs/GROWTH.md` §4.1).
The content pipeline has the agent draft and a person publish (ADR-0015), so a module is a text file
whose diff a person reads, and the banned-words lint reads module bodies (ADR-0025). Today's budget
(`docs/ENGINEERING.md` §4) leaves no room for a Markdown parser at run time, and the site pages are
prerendered by `apps/web/src/site/render.tsx` with no script (ADR-0045).

Facts from mdxjs.com, read 2026-10-30: `@mdx-js/rollup` (release line 3) is the Rollup and Vite plugin
that compiles MDX; with `@vitejs/plugin-react` it must run in the `pre` phase. Its options are those
of `@mdx-js/mdx`'s compile: with the default `jsxRuntime: 'automatic'` and `jsxImportSource: 'react'`
the output imports only `Fragment`, `jsx` and `jsxs` from `react/jsx-runtime`, and exports a default
`MDXContent(props)` that takes its elements from `props.components`. MDX does not support front matter
by default; `remark-frontmatter` recognises the block but does not parse it. MDX adds `import` and
`export` statements, expressions in curly braces and JSX to Markdown, and an unescaped `{` or `<` must
be escaped.

## Options considered

1. **MDX compiled at build by `@mdx-js/rollup`.** A module becomes a React component in its own chunk;
   nothing parses Markdown on the device. One dev dependency.
2. **Markdown parsed at run time** (a parser in the client). Adds the parser to the Learn chunk and
   to every sheet, renders through HTML strings that need sanitising, and gives the chart no place in
   the text.
3. **Plain `.md` compiled by the same plugin** (`format: 'md'`). No expressions to police, but no
   element either, so the one chart cannot sit where it earns its place in the text.
4. **Modules as TSX or JSON in code.** Typed, but the person who publishes reads code diffs, and the
   banned-words lint has to find the prose inside it.
5. **YAML front matter** through `remark-frontmatter` and a YAML library. A second dependency, and
   YAML's implicit types (a bare date read as a date, `no` as false in YAML 1.1) for a schema that
   needs only strings.

## Decision

Option 1, with these constraints.

- **The compiler.** `@mdx-js/rollup` is a dev dependency of `packages/config`, added to the hosts' Vite
  factory in the `pre` phase, so `apps/web`, `apps/mobile` and the prerender share one configuration.
  The defaults stay: automatic runtime, `react` as the import source, no `providerImportSource`. The
  exact version is pinned when it is added (ADR-0025's catalog and release-age rules). No runtime
  dependency: a compiled module imports only `react/jsx-runtime`, which the app already ships.
- **Front matter is flat `key: value` lines** between two `---` lines at the top of the file, parsed
  in-house in `packages/content`: one key per line, the value is the rest of the line as a string, no
  nesting, no quotes, no multi-line values. A list (the `facts` keys) is one comma-separated value
  that the schema splits. The zod schema of `docs/EDUCATION.md` §10 validates and converts the
  strings. The same parser serves the loader and `pnpm validate:content`.
- **A module body is Markdown and a closed set of elements.** No `import`, no `export`, no `{}`
  expression: a module carries text, never code. The elements a body may use are the ones the
  renderer passes through `components` (the chart named in front matter, placed where it earns its
  place, and the Markdown elements mapped to `packages/ui`'s type). The loader walks the syntax tree
  and fails the build on an `mdxjsEsm`, `mdxFlowExpression` or `mdxTextExpression` node and on any
  element outside the set; the content validation refuses the same files, so the failure shows before
  a build.
- **The loader computes, the author never types**: the body's word count and the reading time
  (`docs/CONTENT-STYLE.md` §5 owns the formula) are computed from the body without front matter and
  added to the module's metadata; the 400-word limit is checked on that count.
- **Metadata apart from bodies.** The loader strips the front matter before compiling and exposes
  every module's metadata (front matter plus words and reading time) as one small module, so the
  Learn index and the "Why?" links show titles and reading times without loading a body; each body is
  a lazily loaded chunk.
- **The rendering points.** One renderer in `packages/app`'s learn feature takes a module's component
  and its metadata and renders the caveat box, the dated figures and the body. Three places use it:
  the sheet that a "Why?" link opens without leaving the screen (`docs/EDUCATION.md`'s table), Learn's
  route for one module, and the site pages, where the prerender renders the same component to static
  HTML with no script.

## Consequences

- No Markdown parser reaches the device; Today's budget is untouched, since no body loads with Today.
- A module's diff is prose and a few `key: value` lines, which the person who publishes can read
  (ADR-0015); the banned-words and styling lints read module files as text (ADR-0025).
- An unescaped `{` or `<` in prose fails the build; the author writes `\{` and `\<`. The content
  validation names the line.
- Storybook stories that render a module need the same plugin in their Vite configuration; knip and
  the dependency rule must know the `.mdx` extension. Both land with the dependency.
- The flat front matter cannot hold structure. A module that needs structured data takes it from
  `packages/content` by key, as `facts` does, never from its own front matter.
- If MDX's compiler stops emitting the automatic runtime's imports, or a module needs an expression,
  this ADR is superseded, not bent.

## Disagreement

None.

## Deviations

Recorded by the build session on 2026-11-01, when the pipeline landed in `packages/config/vite/learn-plugin.ts`.

- `@mdx-js/rollup` goes in `packages/config`'s `dependencies`, beside its sibling plugins. That package
  is dev-time only, so nothing reaches a bundle.
- `parseModule` is passed into the plugin, because `packages/content` already devDepends on
  `packages/config`, and turbo refuses a cycle in the package graph.
- The install of `@mdx-js/rollup` 3.1.1 (published 2025-08-29) under the release-age, trust and
  exotic-subdependency settings of `pnpm-workspace.yaml` added 111 packages and removed 2; nothing was
  refused. mdxjs.com's Vite section (read 2026-11-01) also has `@vitejs/plugin-react` take `.mdx` in its
  `include`, so the factory passes it.

Recorded by the build session on 2026-11-02, when the screens landed in `packages/app/src/features/learn`.

- The early check in `packages/content/src/modules-validate.ts` may refuse more than the compiler's tree
  walk, so a body can fail validation on something the compiler would have passed; that is the safe side.
- `packages/config/dependency-cruiser.cjs` names `virtual:learn-modules` for two rules. `no-unresolvable`
  lists it as built in. `product-reaches-only-product` gains that one exact name, because the module is
  generated at build from `packages/content/learn/`, already a product folder. Neither rule is otherwise
  changed: both still fail on any other virtual name. The new rule `learn-modules-only-in-learn` keeps the
  name's importers to the learn feature; the shell and the hosts reach it through the feature's index.
- `createHostConfig` sets `resolve.dedupe: ['react']`, because a compiled module imports `react/jsx-runtime`
  from `packages/content`, a package that may not depend on react. The host's react serves it.

Recorded by the build session on 2026-11-02, when the "Why?" sheet landed in
`packages/app/src/features/learn/components/module-sheet.tsx`.

- A body holds no link. `MODULE_ELEMENTS` has no `a`, so a Markdown link would compile to a raw `<a>` that
  leaves the hash route on mobile. `closedBody` refuses a link, a reference link, an image and a link
  definition; the early check in `packages/content/src/modules-validate.ts` refuses an inline one. The screens
  link to a module, never the other way round.
- An h2's id comes from `MODULE_ELEMENTS` (`headingId`), from the heading's text, so the compiled module
  carries none and no new dependency is needed.
- The metadata sits in the lazy chunks, not with Today, so the link shows `Why?` alone, not a title or a
  reading time. The module's idea titles the sheet, once it has loaded.

Recorded on 2026-11-02, when the Cycles module brought the first past-performance line into a body. The owner
delegated the call to a session (ADR-0015 Deviations).

- The closed set gains one element, `PastPerformance`, which sets that line's sentence and the Risk link as one:
  `MODULE_ELEMENTS` holds it and `createHostConfig` allows it. ADR-0047's Style asks for a link with every disclosure,
  and Learn's route opens with no plan, so that reader may have met no disclosure and has no footer. A module's text
  still holds no link. `packages/content/src/modules-validate.ts` refuses the words `past performance` in a module's
  own text, so the sentence cannot stand without its link and a module with no such line shows no link. One element
  was chosen over a link that must follow the sentence: two review rounds showed that a check on the text could not
  read a list, a quote, a heading or a sentence's end, and only the compiler reads those.

- 2026-11-09: `pnpm validate:content` runs the build's compiler and `closedBody` on every module (`checkModuleBody`),
  with the one list `MODULE_BODY_ELEMENTS` that the hosts, Storybook and the app's tests also take; it reports
  `module-closed-body`.
