export { CoinEditor, type CoinEditorProps } from './components/coin-editor';
export { CountryDateLine } from './components/country-date-line';
export { ConditionLines, HoldingConditions } from './components/holding-conditions';
export { WhyLink, type WhyLinkProps } from './components/why-link';
export { type CoinSplitValue, coinSplit, type SplitIssue, splitValueOf } from './lib/split';

/**
 * The screen, by its loader alone: Today imports this file for the link, and a static export here would put the
 * screen, the metadata of every module and the bodies' loaders into the entry chunk.
 */
export const loadLearnScreen = () => import('./components/learn-screen').then((m) => ({ default: m.LearnScreen }));
