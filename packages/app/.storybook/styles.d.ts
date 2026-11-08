// The preview imports its style sheet for the side effect only, and Vite bundles it;
// noUncheckedSideEffectImports needs a module for it. It exports nothing, so an import has nothing
// to read.
declare module '*.css' {}
