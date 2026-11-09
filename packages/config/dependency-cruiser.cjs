// The dependency rule of docs/ARCHITECTURE.md, enforced in CI (ADR-0025). Biome's noRestrictedImports
// mirrors the coarse layer rules for editor feedback; this file is the authority.
//
//   apps/*  →  packages/app/features  →  packages/app/lib  →  packages/{core, ui, content, data}
//   packages/ui, packages/content  →  packages/core (types only)
//   packages/core  →  nothing in the repository

// pnpm resolves to node_modules/.pnpm/<name>@<version>/node_modules/<name>/…, which always contains a
// plain `node_modules/<name>/` segment; matching that keeps the regex free of nested quantifiers.
const NODE_MODULE = (names) => `(^|/)node_modules/(${names})/`;
const TESTS = '\\.(test|property\\.test|stories)\\.tsx?$|/test/|/e2e/';

// Product code: what a host bundles or the function runs. apps/web/api holds the function's entry;
// apps/*/scripts are build scripts and stay out. Dots are written [.] so the patterns survive any
// shell that eats a doubled backslash.
const PRODUCT = '^(apps/(web|mobile)/(src|lib|server|api)|packages/[^/]+/src)/';
// Test data inside or beside the product folders: tests and stories, the services over fakes
// (testing.ts, testing-modules.ts, a testing/ folder, a .testing module) and the fixtures.
const TEST_DATA = [
  '[.](test|property[.]test|stories)[.]tsx?$',
  '[.]testing[.]tsx?$',
  '/testing/',
  '(^|/)testing(-modules)?[.]tsx?$',
  '(^|/)fixtures(/|[.]tsx?$)',
];
// Every folder product code may reach; anything else it reaches (apps/*/e2e, apps/*/lighthouse,
// packages/*/test, a script) is not product code. A Node built-in is imported as node:<name>, and
// virtual:learn-modules is generated at build from packages/content/learn/, already in this list;
// learn-modules-only-in-learn keeps its importers to the learn feature (ADR-0048, Deviations).
const PRODUCT_FOLDERS = [
  '^apps/(web|mobile)/(src|lib|server|api|messages)/',
  '^packages/[^/]+/src/',
  '^packages/content/(coins[.]json|templates/|jurisdictions/|rules/|facts/|cycles/|style/|learn/)',
  '(^|/)node_modules/',
  '^node:',
  '^virtual:learn-modules$',
];

/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    {
      name: 'core-is-pure',
      comment: 'packages/core imports nothing from the repository and only big.js and zod from npm (ADR-0016).',
      severity: 'error',
      from: { path: '^packages/core/src/', pathNot: TESTS },
      to: { pathNot: ['^packages/core/', NODE_MODULE('big\\.js|zod')] },
    },
    {
      name: 'core-no-node-builtins',
      comment: 'packages/core does no I/O: no Node built-ins (ADR-0016).',
      severity: 'error',
      from: { path: '^packages/core/' },
      to: { dependencyTypes: ['core'] },
    },
    {
      name: 'ui-and-content-use-core-types-only',
      comment:
        'packages/ui and packages/content may import packages/core types, never its runtime (docs/ARCHITECTURE.md).',
      severity: 'error',
      from: { path: '^packages/(ui|content)/', pathNot: TESTS },
      to: { path: '^packages/core/', dependencyTypesNot: ['type-only'] },
    },
    {
      name: 'ui-imports-no-product-code',
      comment: 'packages/ui never imports packages/app, packages/content, packages/data or a host.',
      severity: 'error',
      from: { path: '^packages/ui/' },
      to: { path: '^(apps/|packages/(app|content|data)/)' },
    },
    {
      name: 'content-imports-no-product-code',
      comment: 'packages/content is data: no React, no app code, no host (docs/ARCHITECTURE.md).',
      severity: 'error',
      from: { path: '^packages/content/' },
      to: { path: ['^(apps/|packages/(app|ui|data)/)', NODE_MODULE('react|react-dom')] },
    },
    {
      name: 'data-imports-nothing',
      comment: 'packages/data imports only zod.',
      severity: 'error',
      from: { path: '^packages/data/' },
      to: { path: '^(apps/|packages/(?!data/))' },
    },
    {
      name: 'packages-never-import-hosts',
      comment: 'Nothing points upward: no package imports apps/* (ADR-0032).',
      severity: 'error',
      from: { path: '^packages/' },
      to: { path: '^apps/' },
    },
    {
      name: 'hosts-are-independent',
      comment: 'apps/web and apps/mobile never import each other.',
      severity: 'error',
      from: { path: '^apps/([^/]+)/' },
      to: { path: '^apps/', pathNot: '^apps/$1/' },
    },
    {
      name: 'lib-never-imports-features',
      comment: 'packages/app/lib is below the features (docs/ARCHITECTURE.md).',
      severity: 'error',
      from: { path: '^packages/app/src/lib/' },
      to: { path: '^packages/app/src/features/' },
    },
    {
      name: 'features-meet-through-index',
      comment: "A feature imports another feature only through that feature's index.ts.",
      severity: 'error',
      from: { path: '^packages/app/src/features/([^/]+)/' },
      to: {
        path: '^packages/app/src/features/',
        pathNot: ['^packages/app/src/features/$1/', '^packages/app/src/features/[^/]+/index\\.ts$'],
      },
    },
    {
      name: 'no-next-anywhere',
      comment: 'Next left the repository with ADR-0045 step 6: nothing under apps or packages imports it, in any form.',
      severity: 'error',
      from: { path: '^(apps|packages)/' },
      // The bare specifier too, as for wouter: next is not installed, so the import keeps its name.
      to: { path: [NODE_MODULE('next'), '^next(/|$)'] },
    },
    {
      name: 'wouter-only-in-navigation',
      comment:
        'wouter is imported only by the navigation adapter, packages/app/src/lib/navigation (ADR-0045 §9); screens and features navigate through it.',
      severity: 'error',
      from: { pathNot: '^packages/app/src/lib/navigation/' },
      // The bare specifier too: an unresolvable import keeps its name, so the rule fires by its own
      // name where wouter is not installed, not only through no-unresolvable.
      to: { path: [NODE_MODULE('wouter'), '^wouter(/|$)'] },
    },
    {
      name: 'learn-modules-only-in-learn',
      comment:
        "Only the learn feature imports virtual:learn-modules (ADR-0048, Deviations); the shell and the hosts reach it through the feature's index. Direct imports only; tests and stories may.",
      severity: 'error',
      from: { pathNot: ['^packages/app/src/features/learn/', ...TEST_DATA] },
      to: { path: '^virtual:learn-modules$' },
    },
    {
      name: 'hosts-never-reach-server',
      comment:
        "A host's client source never reaches a server module, directly or through other modules (ADR-0045 §11, the second of the three guards; the first is the Vite plugin clientNeverImportsServer).",
      severity: 'error',
      from: { path: '^apps/[^/]+/src/' },
      to: {
        path: [NODE_MODULE('server-only|@upstash/redis|@vercel/functions'), '^apps/web/(lib/server|server)/'],
        reachable: true,
      },
    },
    {
      name: 'product-reaches-only-product',
      comment:
        'Product code reaches only product folders, directly or through other modules: never an e2e seed, the Lighthouse seed, a package test folder (however reached, a package export included) or a script; tests and stories may.',
      severity: 'error',
      from: { path: PRODUCT, pathNot: TEST_DATA },
      // The resolved path is matched, so a package export into its test folder counts.
      to: { pathNot: PRODUCT_FOLDERS, reachable: true },
    },
    {
      name: 'no-test-data-in-product',
      comment:
        'Product code never reaches test data inside the product folders, directly or through other modules: the fixtures, the services over fakes (testing, testing-modules, a testing/ folder, a .testing module), a test or a story.',
      severity: 'error',
      from: { path: PRODUCT, pathNot: TEST_DATA },
      to: { path: TEST_DATA, reachable: true },
    },
    {
      name: 'no-unresolvable',
      comment: 'An import that cannot be resolved hides from every other rule.',
      severity: 'error',
      from: {},
      to: { couldNotResolve: true },
    },
    {
      name: 'no-circular',
      severity: 'error',
      from: {},
      to: { circular: true },
    },
    {
      name: 'no-orphans',
      comment: 'A module nothing imports and that imports nothing is dead code or a misplaced config.',
      severity: 'error',
      from: {
        orphan: true,
        pathNot: [
          '\\.d\\.ts$',
          '^packages/config/',
          '(^|/)[^/]+\\.config\\.(ts|mjs|cjs|js)$',
          // The web host's entries nothing imports (ADR-0045): the worker esbuild bundles, the kill
          // switch Vercel serves as a static file, the function file Vercel runs.
          '^apps/web/(src/sw\\.ts|public/serwist/sw\\.js|api/index\\.mjs)$',
          '\\.json$',
          TESTS,
        ],
      },
      to: {},
    },
  ],
  options: {
    doNotFollow: { path: 'node_modules' },
    exclude: { path: '(^|/)(dist|server-dist|out|coverage|storybook-static|playwright-report|test-results)/' },
    tsPreCompilationDeps: true,
    combinedDependencies: true,
    // The one virtual module the hosts' Learn pipeline serves (ADR-0048, Deviations): it has no file to
    // resolve, so it is named here, exactly; no-unresolvable stands for every other name.
    builtInModules: { add: ['virtual:learn-modules'] },
    enhancedResolveOptions: {
      exportsFields: ['exports'],
      conditionNames: ['types', 'import', 'module', 'default', 'require', 'node'],
      mainFields: ['module', 'main', 'types', 'typings'],
      // .mdx: the Learn modules, compiled by the hosts' Vite factory (ADR-0048).
      extensions: ['.ts', '.tsx', '.d.ts', '.mjs', '.js', '.cjs', '.json', '.mdx'],
    },
    reporterOptions: { text: { highlightFocused: true } },
  },
};
