import type { LearnModuleMeta } from '@proofofcalm/content';
import type { CalendarDate } from '@proofofcalm/core';

// Taxes where you live (docs/EDUCATION.md §4): its slug and the id of the plan's country's card that leads it. Both
// stay in the lazy chunk, out of the feature's `index.ts`, which Today's entry imports.

export const TAXES_MODULE = 'taxes-where-you-live' satisfies LearnModuleMeta['slug'];
/** The id of the lead card's heading, where a "Why?" opens the sheet. */
export const YOUR_COUNTRY = 'your-country';

/**
 * Which line stands under a module's title (docs/CONTENT-STYLE.md §5): `overdue` from the day after `nextReviewDue`,
 * not on the due day itself (ISO dates compare as strings, so this chunk imports no value of the core); until then
 * `next` for the tax module, which names its next review, and `reviewed` for every other module. The core's
 * `underReview` is a different rule: a country card twelve months past its `nextReviewDue` (docs/JURISDICTIONS.md §1).
 */
export function reviewLine(
  module: Pick<LearnModuleMeta, 'slug' | 'nextReviewDue'>,
  today: CalendarDate,
): 'reviewed' | 'next' | 'overdue' {
  if (today > module.nextReviewDue) return 'overdue';
  return module.slug === TAXES_MODULE ? 'next' : 'reviewed';
}
