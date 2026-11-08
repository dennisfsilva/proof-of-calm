// The closed set of user-caused errors from the actions of docs/DOMAIN.md §6, each with the data the UI
// needs to phrase it (§10). The shell maps codes to copy; a new code fails the build where it is unmapped.
import type { MonthKey } from '../dates/calendar';
import type { Units } from '../money/decimal';
import type { CoinId } from '../schema/ids';

export type ActionError =
  | { readonly code: 'no-coins' }
  | { readonly code: 'amount-and-units'; readonly coin: CoinId }
  | { readonly code: 'unknown-coin'; readonly coin: CoinId }
  | { readonly code: 'units-precision'; readonly coin: CoinId }
  | { readonly code: 'fee-negative' }
  | { readonly code: 'fee-not-allowed' }
  | { readonly code: 'slot-required' }
  | { readonly code: 'slot-not-allowed' }
  | { readonly code: 'unknown-slot'; readonly slot: MonthKey }
  | { readonly code: 'sell-exceeds-held'; readonly coin: CoinId; readonly held: Units; readonly sold: Units }
  | { readonly code: 'slot-done'; readonly slot: MonthKey }
  | { readonly code: 'slot-skipped'; readonly slot: MonthKey }
  | { readonly code: 'note-too-long'; readonly max: number }
  | { readonly code: 'venue-too-long'; readonly max: number }
  | { readonly code: 'pause-order' }
  | { readonly code: 'pauses-overlap' }
  | { readonly code: 'not-paused' }
  | { readonly code: 'before-first-buy' }
  | { readonly code: 'buying-over' }
  | { readonly code: 'plan-changed' }
  | { readonly code: 'too-many-entries'; readonly max: number };

export type ActionErrorCode = ActionError['code'];

/** Every code, for the shell's tests that each one has copy. */
export const ACTION_ERROR_CODES = [
  'no-coins',
  'amount-and-units',
  'unknown-coin',
  'units-precision',
  'fee-negative',
  'fee-not-allowed',
  'slot-required',
  'slot-not-allowed',
  'unknown-slot',
  'sell-exceeds-held',
  'slot-done',
  'slot-skipped',
  'note-too-long',
  'venue-too-long',
  'pause-order',
  'pauses-overlap',
  'not-paused',
  'before-first-buy',
  'buying-over',
  'plan-changed',
  'too-many-entries',
] as const satisfies readonly ActionErrorCode[];

// The list names every code: a code added to ActionError and not here fails the build.
const _everyCode: [Exclude<ActionErrorCode, (typeof ACTION_ERROR_CODES)[number]>] extends [never] ? true : never = true;
