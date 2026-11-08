// The Learn pipeline's virtual module (ADR-0048, packages/config/vite/learn-plugin.ts) and the `.mdx` files
// the stories and tests import. A script file: a top-level import would turn these into augmentations of a
// module, so each import sits inside its declaration. An ambient declaration may not `import` a relative
// path, so the elements' type is an `import()` type.

declare module 'virtual:learn-modules' {
  import type { LearnModuleMeta } from '@proofofcalm/content';
  import type { ComponentType } from 'react';

  type Body = ComponentType<{ components: import('./lib/body-elements').BodyElements }>;

  /** Every module's metadata, in the order of docs/EDUCATION.md §10; no body text. */
  export const LEARN_MODULES: readonly LearnModuleMeta[];
  /** A lazy import per slug, each body its own chunk. */
  export const LEARN_BODIES: Readonly<Record<string, () => Promise<{ default: Body }>>>;
}

declare module '*.mdx' {
  import type { ComponentType } from 'react';

  const Body: ComponentType<{ components: import('./lib/body-elements').BodyElements }>;
  export default Body;
}
