// What the adapters ask of a schema at a boundary (an API answer, a stored draft): zod/mini's
// `safeParse`. Any schema from packages/core fits as it is, and the value's type is inferred from it, so
// it is never written twice (docs/ENGINEERING.md §1.4); packages/app itself needs no zod import.
export type Schema<T> = {
  safeParse(input: unknown): { readonly success: true; readonly data: T } | { readonly success: false };
};
