// The content package (docs/ARCHITECTURE.md): schemas and the lint, and the loaders the app reads. The
// loaders import types only from the schemas, so an app that uses them ships the data without zod. The one
// exception is the Learn modules' parser, which needs zod at run time: it is the subpath `./modules`, and
// this index exports only its types.
export * from './loaders/coins.ts';
export * from './loaders/countries.ts';
export type { LearnModule, LearnModuleMeta } from './loaders/modules.ts';
export * from './loaders/rules.ts';
export * from './loaders/templates.ts';
export * from './schema/coin.ts';
export * from './schema/common.ts';
export * from './schema/cycles.ts';
export * from './schema/drawdown.ts';
export * from './schema/fact.ts';
export * from './schema/jurisdiction.ts';
export type { ModuleFrontMatter } from './schema/module.ts';
export * from './schema/template.ts';
export * from './style/banned.ts';
export * from './validate.ts';
