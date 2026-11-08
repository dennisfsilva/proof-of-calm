// The preview imports the package's style sheets for their side effects only, and Vite bundles
// them; noUncheckedSideEffectImports needs a module for each. It exports nothing, so an import has
// nothing to read.
declare module '*.css' {}
