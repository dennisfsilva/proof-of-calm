export { CountryDateLine } from '../learn';
export { CoinEditor, type CoinEditorProps } from './components/coin-editor';
export { EarlyWindowNotice, type EarlyWindowNoticeProps } from './components/early-window-notice';
export { HoldingRuleEditor, type HoldingRuleEditorProps } from './components/holding-rule-editor';
export { ScheduleEditor, type ScheduleEditorProps } from './components/schedule-editor';
export { SellWindowEditor, type SellWindowEditorProps } from './components/sell-window-editor';
export {
  type HoldingCountry,
  type HoldingIssue,
  type HoldingValue,
  holdingCountryOf,
  holdingRuleOf,
  holdingRuleText,
  holdingValueOf,
} from './lib/holding';
export { type ReminderWords, reminderFile, reminderGap, useReminderWords } from './lib/reminder';
export { earlyToAccept, type Schedule, type ScheduleIssue, type ScheduleValue, schedule } from './lib/schedule';
export {
  acceptedAsStored,
  type EarlyNotice,
  type EarlyOpen,
  earlyOpenOf,
  ruleNameOf,
  type SellWindowIssue,
  type SellWindowValue,
  sameWindow,
  sellWindowOf,
  sellWindowValueOf,
} from './lib/sell-window';
export { type CoinSplitValue, coinSplit, type SplitIssue } from './lib/split';

/**
 * The screens, by their loaders alone (as Learn's): Onboarding and Settings import this file for the editors, and
 * with the screens exported here the route's `import()` of this file made it Plan's chunk, which those screens then
 * import statically, Plan's screen code with it (ADR-0045 §9).
 */
export const loadPlanScreen = () => import('./components/plan-screen').then((m) => ({ default: m.PlanScreen }));
export const loadReviewScreen = () => import('./components/review-screen').then((m) => ({ default: m.ReviewScreen }));
