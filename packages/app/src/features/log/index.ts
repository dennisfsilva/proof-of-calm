export { EntryForm, type EntryFormProps } from './components/entry-form';
export type { EntrySheetProps } from './components/entry-sheet';
export type { SkipSheetProps } from './components/skip-sheet';

/** The screen, by its loader alone (ADR-0045 §9): a feature that imports the sheets takes no screen code with them. */
export const loadLogScreen = () => import('./components/log-screen').then((m) => ({ default: m.LogScreen }));

/**
 * Today's sheets, by loaders too: the routes import this file statically for `loadLogScreen`, so it sits in
 * Today's chunk, and an `import()` of it there made that chunk import the sheets' chunk back, a cycle the
 * build refuses (`noChunkCycles`, ADR-0045 §9).
 */
export const loadEntrySheet = () => import('./components/entry-sheet').then((m) => ({ default: m.EntrySheet }));
export const loadSkipSheet = () => import('./components/skip-sheet').then((m) => ({ default: m.SkipSheet }));
